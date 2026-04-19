import { Extension, onAuthenticatePayload } from '@hocuspocus/server';
import * as jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { config } from '../config';

interface JwtPayload {
  sub: string;
  email: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT authentication extension.
 *
 * - Extracts the token from the `token` query parameter or the `token` cookie.
 * - Verifies the JWT signature against JWT_SECRET.
 * - Checks Redis deny set (`denied_jtis`) for revoked tokens.
 * - On success, populates connection context with userId and email.
 */
export class AuthExtension implements Extension {
  private redis: Redis | null = null;
  private redisReady = false;
  private pool: Pool | null = null;

  constructor() {
    this.initRedis();
    this.initPool();
  }

  private initRedis(): void {
    try {
      this.redis = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times: number) {
          if (times > 5) return null; // stop retrying
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      this.redis.on('ready', () => {
        this.redisReady = true;
        console.log('[auth] Redis connected for token deny-list');
      });

      this.redis.on('error', (err) => {
        this.redisReady = false;
        console.warn('[auth] Redis error:', err.message);
      });

      this.redis.connect().catch((err) => {
        console.warn('[auth] Redis initial connection failed:', err.message);
      });
    } catch (err) {
      console.warn('[auth] Could not initialise Redis client:', (err as Error).message);
    }
  }

  private initPool(): void {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });

      this.pool.on('error', (err) => {
        console.warn('[auth] PostgreSQL pool error:', err.message);
      });
    } catch (err) {
      console.warn('[auth] Could not initialise PostgreSQL pool:', (err as Error).message);
    }
  }

  async onAuthenticate(data: onAuthenticatePayload): Promise<void> {
    const token = this.extractToken(data);

    if (!token) {
      throw new Error('Authentication required: no token provided');
    }

    // Verify JWT
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    } catch (err) {
      throw new Error(`Authentication failed: ${(err as Error).message}`);
    }

    // Check revoked tokens via Redis deny set
    if (payload.jti && this.redis && this.redisReady) {
      try {
        const denied = await this.redis.sismember('denied_jtis', payload.jti);
        if (denied) {
          throw new Error('Authentication failed: token has been revoked');
        }
      } catch (err) {
        // If the error is our own "revoked" error, re-throw it
        if ((err as Error).message.includes('revoked')) {
          throw err;
        }
        // Otherwise Redis is unreachable — allow through (graceful degradation)
        console.warn('[auth] Redis deny-list check failed, allowing connection:', (err as Error).message);
      }
    }

    const role = await this.getDocumentRole(data.documentName, payload.sub);

    if (!role) {
      throw new Error('Authentication failed: no permission for this document');
    }

    // Populate connection context
    data.connectionConfig.readOnly = role === 'viewer' || role === 'commenter';
    data.context.userId = payload.sub;
    data.context.email = payload.email;
    data.context.userRole = role;

    console.log(
      `[auth] authenticated user=${payload.sub} role=${role} email=${payload.email} doc=${data.documentName}`,
    );
  }

  async onDestroy(): Promise<any> {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
      this.redis = null;
    }
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
    }
  }

  /**
   * Extract the JWT from the access-token cookie.
   */
  private extractToken(data: onAuthenticatePayload): string | null {
    const cookieHeader = data.requestHeaders?.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    }

    return null;
  }

  private async getDocumentRole(documentId: string, userId: string): Promise<string | null> {
    if (!this.pool) {
      throw new Error('Authentication failed: permission store unavailable');
    }

    const result = await this.pool.query<{ role: string }>(
      `SELECT p.role
         FROM permissions p
         INNER JOIN documents d ON d.id = p.document_id
        WHERE p.document_id = $1
          AND p.user_id = $2
          AND d.deleted_at IS NULL
        LIMIT 1`,
      [documentId, userId],
    );

    return result.rows[0]?.role ?? null;
  }
}
