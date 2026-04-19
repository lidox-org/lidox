import { Extension } from '@hocuspocus/server';
import type { Hocuspocus, onConfigurePayload } from '@hocuspocus/server';
import Redis from 'ioredis';
import { Pool } from 'pg';
import * as Y from 'yjs';
import { config } from '../config';

/**
 * Version restore extension.
 *
 * Listens on Redis channel `doc:restore` for messages published by the API
 * when a user calls POST /api/documents/:id/versions/:versionId/restore.
 *
 * Message format: { documentId: string, snapshot: string (base64) }
 *
 * On receipt:
 * 1. Finds the live Hocuspocus document (if any clients are connected).
 * 2. Applies the snapshot as a full state replacement via Yjs.
 * 3. Hocuspocus broadcasts the new state to all connected clients automatically.
 */
export class RestoreExtension implements Extension {
  private sub: Redis | null = null;
  private pool: Pool | null = null;
  private instance: Hocuspocus | null = null;
  private ready = false;

  /** Called by Hocuspocus after the server is fully initialised. */
  async onConfigure({ instance }: onConfigurePayload): Promise<void> {
    this.instance = instance;
    this.initRedis();
    this.initPool();
  }

  private initPool(): void {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
      console.log('[restore] PostgreSQL pool initialised');
    } catch (err) {
      console.warn('[restore] Could not create DB pool:', (err as Error).message);
    }
  }

  private initRedis(): void {
    const opts = {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    };

    try {
      this.sub = new Redis(config.REDIS_URL, opts);

      this.sub.on('ready', () => {
        this.ready = true;
        console.log('[restore] Redis subscriber connected');
        void this.sub!.subscribe('doc:restore');
      });

      this.sub.on('error', (err) => {
        this.ready = false;
        console.warn('[restore] Redis error:', err.message);
      });

      this.sub.on('message', (_channel: string, message: string) => {
        void this.handleRestoreMessage(message);
      });

      void this.sub.connect();
    } catch (err) {
      console.warn('[restore] Could not initialise Redis:', (err as Error).message);
    }
  }

  private async handleRestoreMessage(raw: string): Promise<void> {
    try {
      const { documentId, snapshot } = JSON.parse(raw) as {
        documentId: string;
        snapshot: string;
      };

      if (!documentId || !snapshot) {
        console.warn('[restore] malformed restore message');
        return;
      }

      console.log(`[restore] restoring document ${documentId}`);

      // Apply the snapshot to the live Yjs document if clients are connected.
      // Hocuspocus exposes active documents on the instance map.
      const hocuspocusDocuments = this.instance?.documents;

      if (hocuspocusDocuments) {
        const liveDoc = hocuspocusDocuments.get(documentId);
        if (liveDoc) {
          const update = Buffer.from(snapshot, 'base64');
          // Replace the entire document state with the snapshot.
          // encodeStateAsUpdate from the snapshot becomes the new baseline.
          const snapshotDoc = new Y.Doc();
          Y.applyUpdate(snapshotDoc, new Uint8Array(update));
          const replacementUpdate = Y.encodeStateAsUpdate(snapshotDoc);
          Y.applyUpdate(liveDoc, replacementUpdate);
          console.log(
            `[restore] applied snapshot to live doc ${documentId} (${replacementUpdate.length} bytes)`,
          );
        } else {
          console.log(
            `[restore] no live clients for doc ${documentId} — snapshot already in DB, will load on next connect`,
          );
        }
      }
    } catch (err) {
      console.error('[restore] error handling restore message:', (err as Error).message);
    }
  }

  async onDestroy(): Promise<void> {
    if (this.sub) {
      await this.sub.quit().catch(() => {});
      this.sub = null;
    }
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
    }
    console.log('[restore] shutdown complete');
  }
}
