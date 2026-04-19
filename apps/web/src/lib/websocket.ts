import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { HocuspocusProvider } from '@hocuspocus/provider';

// Derive the WebSocket URL from current page hostname so it works in any environment
function getSyncUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:3002`;
}

const providers = new Map<string, HocuspocusProvider>();
const docs = new Map<string, Y.Doc>();
const indexedDbPersistence = new Map<string, IndexeddbPersistence>();

export function getOrCreateDoc(documentId: string): Y.Doc {
  let doc = docs.get(documentId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(documentId, doc);

    // IndexedDB offline buffer — persists CRDT operations locally so edits
    // survive page refreshes and brief network outages (FR-1.3 / US-02).
    try {
      const persistence = new IndexeddbPersistence(`lidox:doc:${documentId}`, doc);
      persistence.on('synced', () => {
        console.log(`[idb] local state loaded for doc=${documentId}`);
      });
      indexedDbPersistence.set(documentId, persistence);
    } catch (err) {
      console.warn('[idb] IndexedDB not available:', err);
    }
  }
  return doc;
}

export function getOrCreateProvider(documentId: string): HocuspocusProvider {
  const existing = providers.get(documentId);
  if (existing) return existing;

  const doc = getOrCreateDoc(documentId);

  const provider = new HocuspocusProvider({
    url: getSyncUrl(),
    name: documentId,
    document: doc,
    broadcast: false,
    onConnect: () => {
      console.log(`[ws] connected to document ${documentId}`);
    },
    onDisconnect: () => {
      console.log(`[ws] disconnected from document ${documentId}`);
    },
    onAuthenticationFailed: ({ reason }) => {
      console.warn(`[ws] authentication failed: ${reason}`);

      if (!shouldRetryAuth(reason)) {
        return;
      }

      // Re-attempt connection — the server reads auth from cookies
      setTimeout(() => {
        provider.connect();
      }, 2000);
    },
  });

  providers.set(documentId, provider);
  return provider;
}

export function destroyProvider(documentId: string): void {
  const provider = providers.get(documentId);
  if (provider) {
    provider.disconnect();
    provider.destroy();
    providers.delete(documentId);
  }

  const persistence = indexedDbPersistence.get(documentId);
  if (persistence) {
    void persistence.destroy();
    indexedDbPersistence.delete(documentId);
  }

  const doc = docs.get(documentId);
  if (doc) {
    doc.destroy();
    docs.delete(documentId);
  }
}

export function getAwareness(documentId: string) {
  const provider = providers.get(documentId);
  return provider?.awareness ?? null;
}

/** Clear the local IndexedDB cache for a document (e.g., after a version restore). */
export async function clearLocalCache(documentId: string): Promise<void> {
  const persistence = indexedDbPersistence.get(documentId);
  if (persistence) {
    await persistence.clearData();
    console.log(`[idb] cleared local cache for doc=${documentId}`);
  }
}

function shouldRetryAuth(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes('token') ||
    normalized.includes('authentication failed') ||
    normalized.includes('authentication required') ||
    normalized.includes('jwt')
  );
}
