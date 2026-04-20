import { Extension, onLoadDocumentPayload, onStoreDocumentPayload } from '@hocuspocus/server';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import * as Y from 'yjs';
import { config } from '../config';

const PREVIEW_CHAR_LIMIT = 220;
const PREVIEW_LINE_LIMIT = 3;
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

type PreviewBranchNode = {
  toArray: () => unknown[];
  toString: () => string;
  nodeName?: string;
};

type PreviewTextNode = {
  toString: () => string;
  toArray?: undefined;
  nodeName?: undefined;
};

function isPreviewBranchNode(value: unknown): value is PreviewBranchNode {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    typeof (value as { toArray?: unknown }).toArray === 'function' &&
    typeof (value as { toString?: unknown }).toString === 'function'
  );
}

function isPreviewTextNode(value: unknown): value is PreviewTextNode {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    typeof (value as { toString?: unknown }).toString === 'function' &&
    typeof (value as { toArray?: unknown }).toArray !== 'function'
  );
}

export function buildVersionPreview(doc: Y.Doc): string | null {
  const segments: string[] = [];

  for (const name of doc.share.keys()) {
    const fragment = doc.getXmlFragment(name);
    if (isPreviewBranchNode(fragment)) {
      appendFragmentPreview(fragment, segments);
    }
  }

  const normalizedLines = segments
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (normalizedLines.length === 0) {
    return null;
  }

  const previewLines: string[] = [];
  let remainingChars = PREVIEW_CHAR_LIMIT;

  for (const line of normalizedLines) {
    if (previewLines.length >= PREVIEW_LINE_LIMIT || remainingChars <= 0) {
      break;
    }

    const nextLine =
      line.length <= remainingChars
        ? line
        : `${line.slice(0, Math.max(0, remainingChars - 1)).trimEnd()}…`;

    if (!nextLine) {
      break;
    }

    previewLines.push(nextLine);
    remainingChars -= nextLine.length;
  }

  return previewLines.join('\n');
}

function appendFragmentPreview(fragment: PreviewBranchNode, segments: string[]): void {
  for (const node of fragment.toArray()) {
    appendNodePreview(node, segments);
  }
}

function appendNodePreview(node: unknown, segments: string[]): void {
  if (isPreviewTextNode(node)) {
    segments.push(node.toString());
    return;
  }

  if (!isPreviewBranchNode(node) || typeof node.nodeName !== 'string') {
    return;
  }

  const tagName = node.nodeName.toLowerCase();

  if (tagName === 'br') {
    segments.push('\n');
    return;
  }

  if (tagName === 'li') {
    segments.push('• ');
  }

  if (BLOCK_TAGS.has(tagName) && needsLineBreak(segments)) {
    segments.push('\n');
  }

  for (const child of node.toArray()) {
    appendNodePreview(child, segments);
  }

  if (BLOCK_TAGS.has(tagName)) {
    segments.push('\n');
  }
}

function needsLineBreak(segments: string[]): boolean {
  const last = segments[segments.length - 1] ?? '';
  return last.length > 0 && !last.endsWith('\n');
}

function buildSnapshotHash(state: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(state)).digest('hex');
}

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
      const snapshotHash = buildSnapshotHash(state);
      const snapshotDoc = new Y.Doc();
      Y.applyUpdate(snapshotDoc, state);
      const previewText = buildVersionPreview(snapshotDoc);

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

      const latestVersionResult = await this.pool.query<{
        snapshot: string | null;
        snapshot_hash: string | null;
      }>(
        `SELECT snapshot, snapshot_hash
         FROM document_versions
         WHERE document_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [data.documentName],
      );

      const latestVersion = latestVersionResult.rows[0];
      if (
        latestVersion &&
        (latestVersion.snapshot_hash === snapshotHash ||
          latestVersion.snapshot === base64)
      ) {
        console.log(
          `[database] skipped duplicate snapshot for doc="${data.documentName}"`,
        );
        return;
      }

      // Retained only for schema compatibility. User-facing numbering is computed
      // by the API from snapshot order instead of the Yjs update byte length.
      const crdtClock = Math.floor(state.length);

      await this.pool.query(
        `INSERT INTO document_versions (
           document_id,
           snapshot,
           crdt_clock,
           preview_text,
           snapshot_hash,
           created_by,
           created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [data.documentName, base64, crdtClock, previewText, snapshotHash, ownerId],
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
