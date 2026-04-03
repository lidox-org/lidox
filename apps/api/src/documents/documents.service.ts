import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { documents, permissions, documentVersions } from '../db/schema';
import { ROLE_HIERARCHY } from '@lidox/types';
import type { CreateDocumentInput, UpdateDocumentInput } from '@lidox/types';

@Injectable()
export class DocumentsService {
  /* ---------------------------------------------------------------- */
  /*  Create                                                           */
  /* ---------------------------------------------------------------- */
  async create(input: CreateDocumentInput, userId: string) {
    const [doc] = await db
      .insert(documents)
      .values({
        title: input.title ?? 'Untitled Document',
        ownerId: userId,
      })
      .returning();

    // Create owner permission
    await db.insert(permissions).values({
      documentId: doc.id,
      userId,
      role: 'owner',
    });

    return doc;
  }

  /* ---------------------------------------------------------------- */
  /*  Get by ID (with permission check)                                */
  /* ---------------------------------------------------------------- */
  async getById(docId: string, userId: string) {
    const doc = await this.findDocument(docId);

    const role = await this.getUserRole(docId, userId);
    if (!role) {
      throw new ForbiddenException('No access to this document');
    }

    return { ...doc, role };
  }

  /* ---------------------------------------------------------------- */
  /*  List user's documents                                            */
  /* ---------------------------------------------------------------- */
  async listForUser(userId: string) {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        ownerId: documents.ownerId,
        aiEnabled: documents.aiEnabled,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        deletedAt: documents.deletedAt,
        role: permissions.role,
      })
      .from(permissions)
      .innerJoin(documents, eq(permissions.documentId, documents.id))
      .where(
        and(
          eq(permissions.userId, userId),
          isNull(documents.deletedAt),
        ),
      );

    return rows;
  }

  /* ---------------------------------------------------------------- */
  /*  Update                                                           */
  /* ---------------------------------------------------------------- */
  async update(docId: string, input: UpdateDocumentInput, userId: string) {
    await this.findDocument(docId);
    const role = await this.getUserRole(docId, userId);

    if (!role) {
      throw new ForbiddenException('No access to this document');
    }

    // aiEnabled changes require owner
    if (input.aiEnabled !== undefined && ROLE_HIERARCHY[role] < ROLE_HIERARCHY['owner']) {
      throw new ForbiddenException('Only the owner can change AI settings');
    }

    // title changes require at least editor
    if (input.title !== undefined && ROLE_HIERARCHY[role] < ROLE_HIERARCHY['editor']) {
      throw new ForbiddenException('You need editor access to change the title');
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.aiEnabled !== undefined) updateData.aiEnabled = input.aiEnabled;

    const [updated] = await db
      .update(documents)
      .set(updateData)
      .where(eq(documents.id, docId))
      .returning();

    return updated;
  }

  /* ---------------------------------------------------------------- */
  /*  Soft delete                                                      */
  /* ---------------------------------------------------------------- */
  async softDelete(docId: string, userId: string) {
    await this.findDocument(docId);
    const role = await this.getUserRole(docId, userId);

    if (!role || role !== 'owner') {
      throw new ForbiddenException('Only the owner can delete this document');
    }

    const [deleted] = await db
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(eq(documents.id, docId))
      .returning();

    return deleted;
  }

  /* ---------------------------------------------------------------- */
  /*  List versions                                                    */
  /* ---------------------------------------------------------------- */
  async listVersions(docId: string, userId: string) {
    const role = await this.getUserRole(docId, userId);
    if (!role) {
      throw new ForbiddenException('No access to this document');
    }

    return db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, docId))
      .orderBy(desc(documentVersions.createdAt))
      .limit(50);
  }

  /* ---------------------------------------------------------------- */
  /*  Restore version                                                  */
  /* ---------------------------------------------------------------- */
  async restoreVersion(docId: string, versionId: string, userId: string) {
    const role = await this.getUserRole(docId, userId);
    if (!role || ROLE_HIERARCHY[role] < ROLE_HIERARCHY['editor']) {
      throw new ForbiddenException('Editor access required to restore versions');
    }

    const [version] = await db
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, docId)))
      .limit(1);

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    return { message: 'Version restored', versionId: version.id };
  }

  /* ---------------------------------------------------------------- */
  /*  Shared helpers                                                   */
  /* ---------------------------------------------------------------- */
  async findDocument(docId: string) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, docId), isNull(documents.deletedAt)))
      .limit(1);

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  async getUserRole(docId: string, userId: string): Promise<string | null> {
    const [perm] = await db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.documentId, docId),
          eq(permissions.userId, userId),
        ),
      )
      .limit(1);

    return perm?.role ?? null;
  }
}
