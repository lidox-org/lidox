import { Extension, onLoadDocumentPayload, onStoreDocumentPayload } from '@hocuspocus/server';
import { Pool } from 'pg';
import * as Y from 'yjs';
import { config } from '../config';

/**
 * PostgreSQL persistence extension.
 *
 * - onLoadDocument: loads the latest document_versions snapshot and applies it.
 * - onStoreDocument: encodes the Yjs state and inserts a new document_versions row.
 * - Debounces writes so we only persist every 5 seconds of activity at most.
 *
 * Schema alignment: uses `snapshot` column (matches apps/api/src/db/migrate.ts).
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
   * Uses `snapshot` column (base64-encoded Yjs state update).
   */
  async onLoadDocument(data: onLoadDocumentPayload): Promise<void> {
    if (!this.pool || !this.poolReady) return;

    try {
      const result = await this.pool.query<{ snapshot: string }>(
        `SELECT snapshot FROM document_versions
         WHERE document_id = $1 AND snapshot IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [data.documentName],
      );

      if (result.rows.length > 0) {
        const snapshot = result.rows[0].snapshot;
        const update = Buffer.from(snapshot, 'base64');
        Y.applyUpdate(data.document, new Uint8Array(update));
        console.log(`[database] loaded snapshot for doc="${data.documentName}" (${update.length} bytes)`);
      } else {
        console.log(`[database] no snapshot found for doc="${data.documentName}", starting fresh`);
      }
    } catch (err) {
      console.error(`[database] failed to load doc="${data.documentName}":`, (err as Error).message);
    }
  }

  /**
   * Persist the current Yjs state to PostgreSQL as a new version row.
   * Debounced: only stores if 5+ seconds have elapsed since the last store.
   *
   * Note: We insert a new row (rather than upsert) to maintain full version history.
   * The API's version listing queries use ORDER BY created_at DESC.
   */
  async onStoreDocument(data: onStoreDocumentPayload): Promise<void> {
    if (!this.pool || !this.poolReady) return;

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

      // Look up the owner/creator for this document to satisfy NOT NULL constraint
      const ownerResult = await this.pool.query<{ owner_id: string }>(
        `SELECT owner_id FROM documents WHERE id = $1 LIMIT 1`,
        [data.documentName],
      );

      if (!ownerResult.rows[0]) {
        console.warn(`[database] document ${data.documentName} not found — skipping snapshot`);
        return;
      }

      const ownerId = ownerResult.rows[0].owner_id;

      // Approximate CRDT clock from state size (monotonically increasing proxy)
      const crdtClock = Math.floor(state.length);

      await this.pool.query(
        `INSERT INTO document_versions (document_id, snapshot, crdt_clock, created_by, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [data.documentName, base64, crdtClock, ownerId],
      );

      console.log(`[database] stored snapshot for doc="${data.documentName}" (${state.length} bytes)`);
    } catch (err) {
      console.error(`[database] failed to store doc="${data.documentName}":`, (err as Error).message);
    }
  }

  async onDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
      console.log('[database] PostgreSQL pool closed');
    }
  }
}
