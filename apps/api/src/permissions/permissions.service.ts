import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../config/database';
import { permissions, users } from '../db/schema';
import { DocumentsService } from '../documents/documents.service';
import { ROLE_HIERARCHY } from '@lidox/types';
import type { ShareDocumentInput } from '@lidox/types';

@Injectable()
export class PermissionsService {
  constructor(private readonly documentsService: DocumentsService) {}

  /* ---------------------------------------------------------------- */
  /*  Share document with a user                                       */
  /* ---------------------------------------------------------------- */
  async share(docId: string, input: ShareDocumentInput, callerId: string) {
    // Verify document exists
    await this.documentsService.findDocument(docId);

    // Check caller is owner
    await this.assertCallerIsOwner(docId, callerId);

    // Find the target user
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!targetUser) {
      throw new NotFoundException(`User with email ${input.email} not found`);
    }

    if (targetUser.id === callerId) {
      throw new BadRequestException('Cannot change your own permission');
    }

    // Check if permission already exists
    const [existing] = await db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.documentId, docId),
          eq(permissions.userId, targetUser.id),
        ),
      )
      .limit(1);

    if (existing) {
      // Update existing permission
      const [updated] = await db
        .update(permissions)
        .set({ role: input.role })
        .where(eq(permissions.id, existing.id))
        .returning();

      return this.enrichPermission(updated);
    }

    // Create new permission
    const [perm] = await db
      .insert(permissions)
      .values({
        documentId: docId,
        userId: targetUser.id,
        role: input.role,
      })
      .returning();

    return this.enrichPermission(perm);
  }

  /* ---------------------------------------------------------------- */
  /*  List permissions for a document                                  */
  /* ---------------------------------------------------------------- */
  async listForDocument(docId: string, callerId: string) {
    await this.documentsService.findDocument(docId);
    await this.assertCallerIsOwner(docId, callerId);

    const rows = await db
      .select({
        id: permissions.id,
        documentId: permissions.documentId,
        userId: permissions.userId,
        linkToken: permissions.linkToken,
        role: permissions.role,
        createdAt: permissions.createdAt,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatarUrl,
      })
      .from(permissions)
      .leftJoin(users, eq(permissions.userId, users.id))
      .where(eq(permissions.documentId, docId));

    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      userId: row.userId,
      linkToken: row.linkToken,
      role: row.role,
      createdAt: row.createdAt,
      user: row.userId
        ? {
            id: row.userId,
            name: row.userName!,
            email: row.userEmail!,
            avatarUrl: row.userAvatar ?? null,
          }
        : null,
    }));
  }

  /* ---------------------------------------------------------------- */
  /*  Revoke a permission                                              */
  /* ---------------------------------------------------------------- */
  async revoke(docId: string, permId: string, callerId: string) {
    await this.documentsService.findDocument(docId);
    await this.assertCallerIsOwner(docId, callerId);

    const [perm] = await db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.id, permId),
          eq(permissions.documentId, docId),
        ),
      )
      .limit(1);

    if (!perm) {
      throw new NotFoundException('Permission not found');
    }

    // Prevent revoking owner permission
    if (perm.role === 'owner') {
      throw new ForbiddenException('Cannot revoke owner permission');
    }

    await db.delete(permissions).where(eq(permissions.id, permId));

    return { deleted: true };
  }

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */
  private async assertCallerIsOwner(docId: string, userId: string) {
    const role = await this.documentsService.getUserRole(docId, userId);
    if (role !== 'owner') {
      throw new ForbiddenException('Only the document owner can manage permissions');
    }
  }

  private async enrichPermission(perm: {
    id: string;
    documentId: string;
    userId: string | null;
    linkToken: string | null;
    role: string;
    createdAt: Date;
  }) {
    let user = null;
    if (perm.userId) {
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, perm.userId))
        .limit(1);
      if (u) {
        user = {
          id: u.id,
          name: u.name,
          email: u.email,
          avatarUrl: u.avatarUrl ?? null,
        };
      }
    }

    return {
      id: perm.id,
      documentId: perm.documentId,
      userId: perm.userId,
      linkToken: perm.linkToken,
      role: perm.role,
      createdAt: perm.createdAt,
      user,
    };
  }
}
