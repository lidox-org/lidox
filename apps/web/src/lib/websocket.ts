import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';

// Derive the WebSocket URL from current page hostname so it works in any environment
function getSyncUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const syncPort = import.meta.env.VITE_SYNC_PORT || '3002';
  return `${protocol}//${window.location.hostname}:${syncPort}`;
}

const providers = new Map<string, HocuspocusProvider>();
const docs = new Map<string, Y.Doc>();
const persistences = new Map<string, IndexeddbPersistence>();

function persistenceName(documentId: string): string {
  return `lidox:${documentId}`;
}

export function getOrCreateDoc(documentId: string): Y.Doc {
  let doc = docs.get(documentId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(documentId, doc);

    const persistence = new IndexeddbPersistence(persistenceName(documentId), doc);
    persistences.set(documentId, persistence);
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

  const doc = docs.get(documentId);
  if (doc) {
    doc.destroy();
    docs.delete(documentId);
  }

  const persistence = persistences.get(documentId);
  if (persistence) {
    void persistence.destroy();
    persistences.delete(documentId);
  }
}

export function getAwareness(documentId: string) {
  const provider = providers.get(documentId);
  return provider?.awareness ?? null;
}

export async function clearLocalCache(documentId: string): Promise<void> {
  const existing = persistences.get(documentId);
  if (existing) {
    await existing.clearData();
    return;
  }

  const tempDoc = new Y.Doc();
  const tempPersistence = new IndexeddbPersistence(persistenceName(documentId), tempDoc);
  try {
    await tempPersistence.clearData();
  } finally {
    tempDoc.destroy();
    await tempPersistence.destroy();
  }
}

function shouldRetryAuth(reason: string): boolean {
  const normalized = reason.toLowerCase();
  if (
    normalized.includes('no permission') ||
    normalized.includes('forbidden') ||
    normalized.includes('revoked')
  ) {
    return false;
  }

  return (
    normalized.includes('token') ||
    normalized.includes('authentication failed') ||
    normalized.includes('authentication required') ||
    normalized.includes('jwt')
  );
}
