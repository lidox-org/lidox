import { z } from 'zod';

export const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(500).default('Untitled Document'),
  templateId: z.string().uuid().optional(),
});

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;

export const UpdateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  aiEnabled: z.boolean().optional(),
});

export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  ownerId: z.string().uuid(),
  aiEnabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type Document = z.infer<typeof DocumentSchema>;

export const DocumentWithRoleSchema = DocumentSchema.extend({
  role: z.enum(['owner', 'editor', 'commenter', 'viewer']),
});

export type DocumentWithRole = z.infer<typeof DocumentWithRoleSchema>;

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  snapshotUrl: z.string().nullable(),
  crdtClock: z.number().int(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
