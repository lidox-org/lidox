import { Extension, onAuthenticatePayload } from '@hocuspocus/server';
import * as jwt from 'jsonwebtoken';
import Redis from 'ioredis';
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

  constructor() {
    this.initRedis();
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

    // Populate connection context
    data.connectionConfig.readOnly = false;
    data.context.userId = payload.sub;
    data.context.email = payload.email;

    console.log(`[auth] authenticated user=${payload.sub} email=${payload.email} doc=${data.documentName}`);
  }

  async onDestroy(): Promise<any> {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
      this.redis = null;
    }
  }

  /**
   * Extract the JWT from the `token` query parameter or the `token` cookie.
   */
  private extractToken(data: onAuthenticatePayload): string | null {
    // 1. Hocuspocus passes token from client-side provider
    if (data.token) {
      return data.token;
    }

    // 2. Query parameter
    const url = data.requestParameters;
    if (url) {
      const tokenParam = url.get('token');
      if (tokenParam) return tokenParam;
    }

    // 3. Cookie header
    const cookieHeader = data.requestHeaders?.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) return match[1];
    }

    return null;
  }
}
