import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterSchema, LoginSchema } from '@lidox/types';
import { env } from '../config/env';
import { db } from '../config/database';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /* ---------------------------------------------------------------- */
  /*  POST /api/auth/register                                          */
  /* ---------------------------------------------------------------- */
  @Post('register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.authService.register(parsed.data);

    this.setRefreshCookie(res, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  POST /api/auth/login                                             */
  /* ---------------------------------------------------------------- */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.authService.login(parsed.data);

    this.setRefreshCookie(res, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  POST /api/auth/refresh                                           */
  /* ---------------------------------------------------------------- */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken =
      req.cookies?.refresh_token ||
      (req.body as { refreshToken?: string })?.refreshToken;

    if (!rawToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const result = await this.authService.refresh(rawToken);

    this.setRefreshCookie(res, result.refreshToken);

    return { accessToken: result.accessToken };
  }

  /* ---------------------------------------------------------------- */
  /*  GET /api/auth/me                                                 */
  /* ---------------------------------------------------------------- */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request) {
    const authUser = req.user as { userId: string; email: string };
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  PATCH /api/auth/me                                               */
  /* ---------------------------------------------------------------- */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@Req() req: Request, @Body() body: { name?: string }) {
    const authUser = req.user as { userId: string; email: string };
    if (!body.name?.trim()) {
      throw new BadRequestException('Name is required');
    }
    const [updated] = await db
      .update(users)
      .set({ name: body.name.trim() })
      .where(eq(users.id, authUser.userId))
      .returning();
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      avatarUrl: updated.avatarUrl ?? null,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  POST /api/auth/change-password                                   */
  /* ---------------------------------------------------------------- */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: Request,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    const authUser = req.user as { userId: string; email: string };
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('currentPassword and newPassword are required');
    }
    await this.authService.changePassword(authUser.userId, body.currentPassword, body.newPassword);
    return { message: 'Password changed' };
  }

  /* ---------------------------------------------------------------- */
  /*  POST /api/auth/logout                                            */
  /* ---------------------------------------------------------------- */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Clear the refresh cookie
    res.clearCookie('refresh_token', {
      path: '/api/auth/refresh',
    });

    return { message: 'Logged out' };
  }

  /* ---------------------------------------------------------------- */
  /*  Helper                                                           */
  /* ---------------------------------------------------------------- */
  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/refresh',
      maxAge: env.REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
    });
  }
}
