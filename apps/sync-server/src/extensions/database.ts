import { Extension, onLoadDocumentPayload, onStoreDocumentPayload } from '@hocuspocus/server';
import { Pool } from 'pg';
import * as Y from 'yjs';
import { config } from '../config';

/**
 * PostgreSQL persistence extension.
 *
 * - onLoadDocument: loads the latest document_versions snapshot and applies it.
 * - onStoreDocument: encodes the Yjs state and upserts into document_versions.
 * - Debounces writes so we only persist every 5 seconds of activity at most.
 */
export class DatabaseExtension implements Extension {
  private pool: Pool | null = null;
  private poolReady = false;

  /** Track last-stored timestamps per document to implement debounce. */
  private lastStored = new Map<string, number>();

  /** Debounce interval in milliseconds. */
  private readonly debounceMs = 5_000;

  constructor() {
    this.initPool();
  }

  private initPool(): void {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });

      this.pool.on('error', (err) => {
        console.error('[database] Pool error:', err.message);
        this.poolReady = false;
      });

      // Test the connection
      this.pool
        .query('SELECT 1')
        .then(() => {
          this.poolReady = true;
          console.log('[database] PostgreSQL pool connected');
        })
        .catch((err) => {
          console.warn('[database] PostgreSQL not available at startup:', err.message);
        });
    } catch (err) {
      console.warn('[database] Could not create pool:', (err as Error).message);
    }
  }

  /**
   * Load the latest snapshot for the document from PostgreSQL.
   */
  async onLoadDocument(data: onLoadDocumentPayload): Promise<void> {
    if (!this.pool) return;

    try {
      const result = await this.pool.query<{ data: string }>(
        `SELECT data FROM document_versions
         WHERE document_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [data.documentName],
      );

      if (result.rows.length > 0) {
        const snapshot = result.rows[0].data;
        const update = Buffer.from(snapshot, 'base64');
        Y.applyUpdate(data.document, new Uint8Array(update));
        console.log(`[database] loaded snapshot for doc="${data.documentName}" (${update.length} bytes)`);
      } else {
        console.log(`[database] no snapshot found for doc="${data.documentName}", starting fresh`);
      }

      this.poolReady = true;
    } catch (err) {
      console.error(`[database] failed to load doc="${data.documentName}":`, (err as Error).message);
    }
  }

  /**
   * Persist the current Yjs state to PostgreSQL.
   * Debounced: only stores if 5+ seconds have elapsed since the last store.
   */
  async onStoreDocument(data: onStoreDocumentPayload): Promise<void> {
    if (!this.pool) return;

    // Debounce
    const now = Date.now();
    const lastTime = this.lastStored.get(data.documentName) ?? 0;
    if (now - lastTime < this.debounceMs) {
      return;
    }
    this.lastStored.set(data.documentName, now);

    try {
      const state = Y.encodeStateAsUpdate(data.document);
      const base64 = Buffer.from(state).toString('base64');

      await this.pool.query(
        `INSERT INTO document_versions (document_id, data, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (document_id)
         DO UPDATE SET data = EXCLUDED.data, created_at = NOW()`,
        [data.documentName, base64],
      );

      console.log(`[database] stored snapshot for doc="${data.documentName}" (${state.length} bytes)`);
    } catch (err) {
      console.error(`[database] failed to store doc="${data.documentName}":`, (err as Error).message);
    }
  }

  async onDestroy(): Promise<any> {
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
      console.log('[database] PostgreSQL pool closed');
    }
  }
}
