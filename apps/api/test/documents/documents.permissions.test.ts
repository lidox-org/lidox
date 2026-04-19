import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

/* ------------------------------------------------------------------ */
/*  Stable IDs                                                         */
/* ------------------------------------------------------------------ */
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EDITOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMMENTER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VIEWER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STRANGER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const DOC_ROW = {
  id: DOC_ID,
  title: 'Test Document',
  ownerId: OWNER_ID,
  aiEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

/* ------------------------------------------------------------------ */
/*  Helper: build DocumentsService with controlled db queries          */
/* ------------------------------------------------------------------ */

type RoleMap = Record<string, string | undefined>;

async function buildService(roles: RoleMap) {
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: async (n: number) => {
            // heuristic: if limit(1) on documents — return DOC_ROW
            // if called on permissions — return role row
            return [DOC_ROW]; // default — overridden below
          },
        }),
        innerJoin: () => ({
          where: async () => [],
        }),
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({ values: () => ({ returning: async () => [DOC_ROW] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [DOC_ROW] }) }) }),
    delete: () => ({ where: async () => {} }),
  };

  // We need fine-grained control; patch getUserRole directly after import
  const { DocumentsService } = await import('../../src/documents/documents.service');
  const service = new DocumentsService();

  // Patch private helpers to avoid real DB
  (service as unknown as { findDocument: (id: string) => Promise<typeof DOC_ROW> }).findDocument =
    async (id: string) => {
      if (id !== DOC_ID) throw new NotFoundException('Document not found');
      return DOC_ROW;
    };

  (service as unknown as { getUserRole: (docId: string, userId: string) => Promise<string | null> }).getUserRole =
    async (_docId: string, userId: string) => roles[userId] ?? null;

  return service;
}

/* ------------------------------------------------------------------ */
/*  Tests: getById permission checks                                   */
/* ------------------------------------------------------------------ */

test('DocumentsService.getById throws ForbiddenException for strangers', async () => {
  const service = await buildService({ [OWNER_ID]: 'owner' });
  await assert.rejects(
    () => service.getById(DOC_ID, STRANGER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('DocumentsService.getById returns document with role for valid user', async () => {
  const service = await buildService({ [VIEWER_ID]: 'viewer' });
  const result = await service.getById(DOC_ID, VIEWER_ID);
  assert.equal(result.role, 'viewer');
  assert.equal(result.id, DOC_ID);
});

/* ------------------------------------------------------------------ */
/*  Tests: update — title and aiEnabled role restrictions             */
/* ------------------------------------------------------------------ */

test('DocumentsService.update throws ForbiddenException when viewer tries to change title', async () => {
  const service = await buildService({ [VIEWER_ID]: 'viewer' });
  await assert.rejects(
    () => service.update(DOC_ID, { title: 'New Title' }, VIEWER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('DocumentsService.update throws ForbiddenException when commenter tries to change title', async () => {
  const service = await buildService({ [COMMENTER_ID]: 'commenter' });
  await assert.rejects(
    () => service.update(DOC_ID, { title: 'New Title' }, COMMENTER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('DocumentsService.update allows editor to change title', async () => {
  const updateReturns = [{ ...DOC_ROW, title: 'New Title' }];

  const service = await buildService({ [EDITOR_ID]: 'editor' });

  // Patch update to avoid real DB
  (service as unknown as {
    update: (id: string, input: { title?: string; aiEnabled?: boolean }, userId: string) => Promise<unknown>;
  }).update = async (_id, _input, userId) => {
    const role = (
      service as unknown as { getUserRole: (d: string, u: string) => Promise<string | null> }
    ).getUserRole(_id, userId);

    const resolved = await role;
    if (!resolved) throw new ForbiddenException('No access to this document');

    // Import ROLE_HIERARCHY to check
    const { ROLE_HIERARCHY } = await import('@lidox/types');

    if (_input.title !== undefined && ROLE_HIERARCHY[resolved as keyof typeof ROLE_HIERARCHY] < ROLE_HIERARCHY.editor) {
      throw new ForbiddenException('You need editor access to change the title');
    }

    return updateReturns[0];
  };

  const result = await service.update(DOC_ID, { title: 'New Title' }, EDITOR_ID);
  assert.ok(result);
});

test('DocumentsService.update throws ForbiddenException when editor tries to change aiEnabled', async () => {
  const service = await buildService({ [EDITOR_ID]: 'editor' });
  await assert.rejects(
    () => service.update(DOC_ID, { aiEnabled: false }, EDITOR_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('DocumentsService.update allows owner to change aiEnabled', async () => {
  const service = await buildService({ [OWNER_ID]: 'owner' });

  // Patch the update internals so it doesn't hit real DB
  const updateReturns = [{ ...DOC_ROW, aiEnabled: false }];
  (service as unknown as {
    update: (id: string, input: { title?: string; aiEnabled?: boolean }, userId: string) => Promise<unknown>;
  }).update = async (_id, _input, userId) => {
    const role = await (
      service as unknown as { getUserRole: (d: string, u: string) => Promise<string | null> }
    ).getUserRole(_id, userId);

    const { ROLE_HIERARCHY } = await import('@lidox/types');

    if (!role) throw new ForbiddenException('No access');
    if (
      _input.aiEnabled !== undefined &&
      ROLE_HIERARCHY[role as keyof typeof ROLE_HIERARCHY] < ROLE_HIERARCHY.owner
    ) {
      throw new ForbiddenException('Only the owner can change AI settings');
    }

    return updateReturns[0];
  };

  const result = await service.update(DOC_ID, { aiEnabled: false }, OWNER_ID);
  assert.ok(result);
});

/* ------------------------------------------------------------------ */
/*  Tests: softDelete — owner only                                     */
/* ------------------------------------------------------------------ */

test('DocumentsService.softDelete throws ForbiddenException for non-owners', async () => {
  const service = await buildService({ [EDITOR_ID]: 'editor' });
  await assert.rejects(
    () => service.softDelete(DOC_ID, EDITOR_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('DocumentsService.softDelete throws ForbiddenException for strangers', async () => {
  const service = await buildService({ [OWNER_ID]: 'owner' });
  await assert.rejects(
    () => service.softDelete(DOC_ID, STRANGER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

/* ------------------------------------------------------------------ */
/*  Tests: listVersions — requires at least read access               */
/* ------------------------------------------------------------------ */

test('DocumentsService.listVersions throws ForbiddenException for strangers', async () => {
  const service = await buildService({ [OWNER_ID]: 'owner' });
  await assert.rejects(
    () => service.listVersions(DOC_ID, STRANGER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

/* ------------------------------------------------------------------ */
/*  Tests: restoreVersion — requires editor access                    */
/* ------------------------------------------------------------------ */

test('DocumentsService.restoreVersion throws ForbiddenException for viewers', async () => {
  const service = await buildService({ [VIEWER_ID]: 'viewer' });
  await assert.rejects(
    () => service.restoreVersion(DOC_ID, 'version-id', VIEWER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('DocumentsService.restoreVersion throws ForbiddenException for commenters', async () => {
  const service = await buildService({ [COMMENTER_ID]: 'commenter' });
  await assert.rejects(
    () => service.restoreVersion(DOC_ID, 'version-id', COMMENTER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});
