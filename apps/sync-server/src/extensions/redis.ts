import {
  Extension,
  onConnectPayload,
  onDisconnectPayload,
  onAwarenessUpdatePayload,
} from '@hocuspocus/server';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Presence key schema:
 *   presence:<documentName>  — Hash of { <clientId>: JSON payload }
 *
 * Pub/Sub channel:
 *   awareness:<documentName> — Cursor/selection updates fan-out
 */

interface PresencePayload {
  userId: string;
  email: string;
  clientId: number;
  cursor?: unknown;
  updatedAt: number;
}

/**
 * Redis presence/awareness extension.
 *
 * - Stores per-user presence in Redis Hashes with a 60-second TTL.
 * - Fans out awareness (cursor position) updates via Redis Pub/Sub so
 *   multiple sync-server instances stay in sync.
 */
export class RedisPresenceExtension implements Extension {
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private ready = false;

  /** TTL for presence hash keys in seconds. */
  private readonly presenceTtl = 60;

  constructor() {
    this.initRedis();
  }

  // -------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------

  private initRedis(): void {
    const redisOpts = {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    };

    try {
      this.pub = new Redis(config.REDIS_URL, redisOpts);
      this.sub = new Redis(config.REDIS_URL, redisOpts);

      const onReady = () => {
        this.ready = true;
        console.log('[redis-presence] Redis connected');
      };

      const onError = (err: Error) => {
        this.ready = false;
        console.warn('[redis-presence] Redis error:', err.message);
      };

      this.pub.on('ready', onReady);
      this.pub.on('error', onError);
      this.sub.on('error', onError);

      Promise.all([this.pub.connect(), this.sub.connect()]).catch((err) => {
        console.warn('[redis-presence] Redis initial connection failed:', err.message);
      });
    } catch (err) {
      console.warn('[redis-presence] Could not initialise Redis:', (err as Error).message);
    }
  }

  // -------------------------------------------------------------------
  // Hocuspocus hooks
  // -------------------------------------------------------------------

  /**
   * When a client connects, store their presence in Redis and subscribe
   * to the document's awareness channel.
   */
  async onConnect(data: onConnectPayload): Promise<void> {
    if (!this.pub || !this.ready) return;

    // We don't have full context yet (auth hasn't run), so we just
    // subscribe to the channel. Presence data is written on awareness updates.
    const channel = `awareness:${data.documentName}`;

    try {
      // Subscribe idempotently — ioredis handles duplicate subscriptions
      await this.sub!.subscribe(channel);
    } catch (err) {
      console.warn('[redis-presence] subscribe failed:', (err as Error).message);
    }
  }

  /**
   * When a client disconnects, remove their presence entry from Redis.
   */
  async onDisconnect(data: onDisconnectPayload): Promise<void> {
    if (!this.pub || !this.ready) return;

    const ctx = data.context as { userId?: string } | undefined;
    if (!ctx?.userId) return;

    const key = `presence:${data.documentName}`;

    try {
      await this.pub.hdel(key, ctx.userId);
      console.log(`[redis-presence] removed presence user=${ctx.userId} doc=${data.documentName}`);
    } catch (err) {
      console.warn('[redis-presence] failed to remove presence:', (err as Error).message);
    }
  }

  /**
   * Fan out awareness/cursor updates through Redis Pub/Sub and store
   * the latest presence payload.
   */
  async onAwarenessUpdate(data: onAwarenessUpdatePayload): Promise<void> {
    if (!this.pub || !this.ready) return;

    // data.states is a Map<number, Record<string, unknown>> (clientId -> state)
    const states = data.states ?? [];
    const docName = data.documentName;
    const key = `presence:${docName}`;
    const channel = `awareness:${docName}`;

    try {
      for (const state of states) {
        const clientId = state.clientId as number | undefined;
        const userId =
          (state as any).user?.userId ??
          (state as any).userId ??
          `anon-${clientId ?? 'unknown'}`;

        const payload: PresencePayload = {
          userId: String(userId),
          email: (state as any).user?.email ?? '',
          clientId: clientId ?? 0,
          cursor: (state as any).cursor ?? null,
          updatedAt: Date.now(),
        };

        // Store in Redis hash with TTL
        await this.pub.hset(key, userId, JSON.stringify(payload));
        await this.pub.expire(key, this.presenceTtl);
      }

      // Publish the raw awareness update for other instances
      const message = JSON.stringify({
        documentName: docName,
        states,
        updatedAt: Date.now(),
      });

      await this.pub.publish(channel, message);
    } catch (err) {
      console.warn('[redis-presence] awareness update failed:', (err as Error).message);
    }
  }

  // -------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------

  async onDestroy(): Promise<any> {
    try {
      if (this.sub) {
        await this.sub.quit().catch(() => {});
        this.sub = null;
      }
      if (this.pub) {
        await this.pub.quit().catch(() => {});
        this.pub = null;
      }
      console.log('[redis-presence] Redis connections closed');
    } catch {
      // swallow
    }
  }
}
