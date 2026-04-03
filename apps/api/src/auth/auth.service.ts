import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { users, organizations, refreshTokens } from '../db/schema';
import { env } from '../config/env';
import type { RegisterInput, LoginInput } from '@lidox/types';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  /* ---------------------------------------------------------------- */
  /*  Register                                                         */
  /* ---------------------------------------------------------------- */
  async register(input: RegisterInput) {
    // Check if user already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    // Create default organization for the user
    const [org] = await db
      .insert(organizations)
      .values({ name: `${input.name}'s Org` })
      .returning();

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: input.name,
        orgId: org.id,
      })
      .returning();

    // Issue tokens
    const { accessToken, refreshToken } = await this.issueTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl ?? null,
      },
      accessToken,
      refreshToken,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Login                                                            */
  /* ---------------------------------------------------------------- */
  async login(input: LoginInput) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.issueTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl ?? null,
      },
      accessToken,
      refreshToken,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Refresh Token                                                    */
  /* ---------------------------------------------------------------- */
  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    // Find the refresh token row
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check expiration
    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Reuse detection: if the token was already used, revoke the entire family
    if (storedToken.used) {
      this.logger.warn(
        `Refresh token reuse detected for family ${storedToken.familyId}. Revoking all tokens in family.`,
      );
      await this.revokeFamily(storedToken.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Mark current token as used
    await db
      .update(refreshTokens)
      .set({ used: true })
      .where(eq(refreshTokens.id, storedToken.id));

    // Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, storedToken.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Issue new tokens with the same family
    const { accessToken, refreshToken: newRefreshToken } = await this.issueTokens(
      user.id,
      user.email,
      storedToken.familyId,
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */
  private async issueTokens(userId: string, email: string, familyId?: string) {
    const jti = uuidv4();

    const accessToken = this.jwtService.sign({
      sub: userId,
      email,
      jti,
    });

    // Create refresh token
    const rawRefreshToken = uuidv4();
    const tokenHash = this.hashToken(rawRefreshToken);
    const family = familyId ?? uuidv4();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRATION_DAYS);

    await db.insert(refreshTokens).values({
      userId,
      tokenHash,
      familyId: family,
      expiresAt,
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private async revokeFamily(familyId: string) {
    // Delete all tokens in the family
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.familyId, familyId));
  }

  /** Deny a specific JWT by its jti (used on logout / token compromise) */
  async denyJti(jti: string, ttlSeconds: number = 900) {
    await redis.sadd('denied_jtis', jti);
    // Auto-expire after TTL so the set doesn't grow forever
    // We use a per-key TTL via a sorted set pattern, but for simplicity
    // just set an expiry on the whole key when it's the first entry
    await redis.expire('denied_jtis', ttlSeconds);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('User not found');
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
  }

  async isJtiDenied(jti: string): Promise<boolean> {
    return (await redis.sismember('denied_jtis', jti)) === 1;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
