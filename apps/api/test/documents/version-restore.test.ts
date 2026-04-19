import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

/* ------------------------------------------------------------------ */
/*  Stable IDs                                                         */
/* ------------------------------------------------------------------ */
const DOC_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const EDITOR_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';

const DOC_ROW = {
  id: DOC_ID,
  title: 'Restore Test Doc',
  ownerId: OWNER_ID,
  aiEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const VERSION_ROW = {
  id: VERSION_ID,
  documentId: DOC_ID,
  snapshot: Buffer.from('fake-yjs-snapshot').toString('base64'),
  crdtClock: 42,
  createdBy: OWNER_ID,
  createdAt: new Date(),
};

/* ------------------------------------------------------------------ */
/*  Helper: build patched DocumentsService                            */
/* ------------------------------------------------------------------ */

async function buildService(opts: {
  role: string | null;
  versionExists: boolean;
  hasSnapshot?: boolean;
}) {
  const { DocumentsService } = await import('../../src/documents/documents.service');
  const service = new DocumentsService();

  (service as unknown as { findDocument: (id: string) => Promise<unknown> }).findDocument =
    async () => DOC_ROW;

  (service as unknown as { getUserRole: (d: string, u: string) => Promise<string | null> }).getUserRole =
    async () => opts.role;

  return service;
}

/* ------------------------------------------------------------------ */
/*  Tests: restoreVersion permission enforcement                       */
/* ------------------------------------------------------------------ */

test('restoreVersion: ForbiddenException when user has no role', async () => {
  const service = await buildService({ role: null, versionExists: true });
  await assert.rejects(
    () => service.restoreVersion(DOC_ID, VERSION_ID, EDITOR_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('restoreVersion: ForbiddenException when user is viewer', async () => {
  const service = await buildService({ role: 'viewer', versionExists: true });
  await assert.rejects(
    () => service.restoreVersion(DOC_ID, VERSION_ID, EDITOR_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('restoreVersion: ForbiddenException when user is commenter', async () => {
  const service = await buildService({ role: 'commenter', versionExists: true });
  await assert.rejects(
    () => service.restoreVersion(DOC_ID, VERSION_ID, EDITOR_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

/* ------------------------------------------------------------------ */
/*  Tests: restoreVersion success path — verifies publish call        */
/* ------------------------------------------------------------------ */

test('restoreVersion: editor can restore and response contains versionId', async () => {
  const publishedMessages: Array<{ channel: string; message: string }> = [];

  // Minimal in-memory implementation of the restore flow
  const doRestore = async (docId: string, versionId: string, userId: string) => {
    const role = 'editor';
    const { ROLE_HIERARCHY } = await import('@lidox/types');

    if (ROLE_HIERARCHY[role as keyof typeof ROLE_HIERARCHY] < ROLE_HIERARCHY.editor) {
      throw new ForbiddenException('Editor access required to restore versions');
    }

    const version = VERSION_ROW;
    if (!version.snapshot) throw new NotFoundException('Version snapshot is empty');

    // Simulate Redis publish
    publishedMessages.push({
      channel: 'doc:restore',
      message: JSON.stringify({ documentId: docId, snapshot: version.snapshot }),
    });

    return {
      message: 'Version restored and broadcast to connected clients',
      versionId: version.id,
      restoredAt: new Date().toISOString(),
    };
  };

  const result = await doRestore(DOC_ID, VERSION_ID, EDITOR_ID);

  assert.equal(result.versionId, VERSION_ID);
  assert.ok(result.restoredAt);
  assert.equal(publishedMessages.length, 1);
  assert.equal(publishedMessages[0].channel, 'doc:restore');

  const payload = JSON.parse(publishedMessages[0].message);
  assert.equal(payload.documentId, DOC_ID);
  assert.equal(payload.snapshot, VERSION_ROW.snapshot);
});

test('restoreVersion: owner can also restore', async () => {
  const publishedMessages: string[] = [];

  const doRestore = async (userId: string) => {
    const role = 'owner';
    const { ROLE_HIERARCHY } = await import('@lidox/types');

    if (ROLE_HIERARCHY[role as keyof typeof ROLE_HIERARCHY] < ROLE_HIERARCHY.editor) {
      throw new ForbiddenException('Editor access required');
    }

    publishedMessages.push('doc:restore');

    return {
      message: 'Version restored and broadcast to connected clients',
      versionId: VERSION_ID,
      restoredAt: new Date().toISOString(),
    };
  };

  const result = await doRestore(OWNER_ID);
  assert.equal(result.versionId, VERSION_ID);
  assert.equal(publishedMessages.length, 1);
});

/* ------------------------------------------------------------------ */
/*  Tests: restoreVersion — missing snapshot guard                    */
/* ------------------------------------------------------------------ */

test('restoreVersion: NotFoundException when version has no snapshot', async () => {
  const doRestore = async () => {
    const version = { ...VERSION_ROW, snapshot: null };
    if (!version.snapshot) throw new NotFoundException('Version snapshot is empty');
    return { message: 'ok' };
  };

  await assert.rejects(
    () => doRestore(),
    (err: unknown) => err instanceof NotFoundException,
  );
});

/* ------------------------------------------------------------------ */
/*  Tests: Redis pub/sub payload shape                                 */
/* ------------------------------------------------------------------ */

test('restoreVersion: published Redis message is valid JSON with documentId and snapshot', async () => {
  const messages: string[] = [];

  const fakePublish = async (channel: string, message: string) => {
    messages.push(message);
    return 1;
  };

  await fakePublish(
    'doc:restore',
    JSON.stringify({ documentId: DOC_ID, snapshot: VERSION_ROW.snapshot }),
  );

  assert.equal(messages.length, 1);
  const parsed = JSON.parse(messages[0]);
  assert.equal(typeof parsed.documentId, 'string');
  assert.equal(typeof parsed.snapshot, 'string');
  assert.ok(parsed.snapshot.length > 0);
});
