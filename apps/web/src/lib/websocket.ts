import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

// Derive the WebSocket URL from current page hostname so it works in any environment
function getSyncUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:3002`;
}

const providers = new Map<string, HocuspocusProvider>();
const docs = new Map<string, Y.Doc>();

export function getOrCreateDoc(documentId: string): Y.Doc {
  let doc = docs.get(documentId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(documentId, doc);
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

export async function clearLocalCache(documentId: string): Promise<void> {
  // Offline IndexedDB persistence is not enabled in the current submission.
  void documentId;
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
