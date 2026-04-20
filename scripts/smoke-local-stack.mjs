import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { HocuspocusProvider } from '@hocuspocus/provider';
import WebSocket from 'ws';
import * as Y from 'yjs';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const SYNC_URL = process.env.SYNC_URL ?? 'ws://127.0.0.1:3002';

async function waitFor(check, label, timeoutMs = 20_000, intervalMs = 150) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }
    await delay(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const cookie = response.headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

function buildCookieJar(response) {
  return getSetCookies(response)
    .map((value) => value.split(';', 1)[0])
    .join('; ');
}

async function apiRequest(path, { method = 'GET', body, cookieJar } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookieJar ? { cookie: cookieJar } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return { response, payload };
}

async function registerUser(name) {
  const email = `smoke-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'Passw0rd123!';
  const { response, payload } = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { email, password, name },
  });

  return {
    email,
    password,
    cookieJar: buildCookieJar(response),
    user: payload.user,
  };
}

function makeWebSocketPolyfill(cookieJar) {
  return class CookieWebSocket extends WebSocket {
    constructor(url) {
      super(url, [], {
        headers: {
          Cookie: cookieJar,
        },
      });
    }
  };
}

function createParagraph(text) {
  const paragraph = new Y.XmlElement('p');
  const content = new Y.XmlText();
  content.insert(0, text);
  paragraph.insert(0, [content]);
  return paragraph;
}

function setDocumentText(doc, text) {
  const fragment = doc.getXmlFragment('default');
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(0, [createParagraph(text)]);
  });
}

function getDocumentHtml(doc) {
  return doc.getXmlFragment('default').toString();
}

async function connectProvider(documentId, cookieJar, label) {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: SYNC_URL,
    name: documentId,
    document: doc,
    token: 'cookie-auth',
    WebSocketPolyfill: makeWebSocketPolyfill(cookieJar),
  });

  await waitFor(
    () =>
      provider.configuration.websocketProvider.status === 'connected' &&
      provider.isAuthenticated,
    `${label} provider authentication`,
  );

  return { doc, provider };
}

async function main() {
  const owner = await registerUser('Owner Smoke');
  const editor = await registerUser('Editor Smoke');

  const created = await apiRequest('/api/documents', {
    method: 'POST',
    cookieJar: owner.cookieJar,
    body: { title: `Smoke ${randomUUID().slice(0, 6)}` },
  });
  const documentId = created.payload.id;

  const ownerDocs = await apiRequest('/api/documents', {
    cookieJar: owner.cookieJar,
  });
  assert.equal(ownerDocs.payload.length, 1);
  assert.equal(ownerDocs.payload[0].id, documentId);

  await apiRequest(`/api/documents/${documentId}/share`, {
    method: 'POST',
    cookieJar: owner.cookieJar,
    body: { email: editor.email, role: 'editor' },
  });

  const permissions = await apiRequest(`/api/documents/${documentId}/permissions`, {
    cookieJar: owner.cookieJar,
  });
  assert.equal(permissions.payload.length, 2);

  const editorDocs = await apiRequest('/api/documents', {
    cookieJar: editor.cookieJar,
  });
  assert.equal(editorDocs.payload.length, 1);
  assert.equal(editorDocs.payload[0].role, 'editor');

  const ownerClient = await connectProvider(documentId, owner.cookieJar, 'owner');
  const editorClient = await connectProvider(documentId, editor.cookieJar, 'editor');

  try {
    setDocumentText(ownerClient.doc, 'Version one');
    await waitFor(
      () => getDocumentHtml(editorClient.doc) === '<p>Version one</p>',
      'editor to receive first sync update',
    );

    await delay(6_000);

    setDocumentText(ownerClient.doc, 'Version two');
    await waitFor(
      () => getDocumentHtml(editorClient.doc) === '<p>Version two</p>',
      'editor to receive second sync update',
    );

    await waitFor(
      async () => {
        const versions = await apiRequest(`/api/documents/${documentId}/versions`, {
          cookieJar: owner.cookieJar,
        });
        return versions.payload.length >= 2;
      },
      'version snapshots to persist',
      20_000,
      500,
    );

    const versions = await apiRequest(`/api/documents/${documentId}/versions`, {
      cookieJar: owner.cookieJar,
    });
    const oldestVersion = versions.payload.at(-1);
    assert.ok(oldestVersion, 'expected at least one stored version');

    await apiRequest(
      `/api/documents/${documentId}/versions/${oldestVersion.id}/restore`,
      {
        method: 'POST',
        cookieJar: owner.cookieJar,
      },
    );

    await waitFor(
      () =>
        getDocumentHtml(ownerClient.doc) === '<p>Version one</p>' &&
        getDocumentHtml(editorClient.doc) === '<p>Version one</p>',
      'restore to propagate to both connected clients',
    );
  } finally {
    ownerClient.provider.destroy();
    editorClient.provider.destroy();
    ownerClient.doc.destroy();
    editorClient.doc.destroy();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase: API_BASE,
        syncUrl: SYNC_URL,
        documentId,
        ownerEmail: owner.email,
        editorEmail: editor.email,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
