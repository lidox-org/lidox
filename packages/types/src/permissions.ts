import { z } from 'zod';

export const DocumentRole = z.enum(['owner', 'editor', 'commenter', 'viewer']);
export type DocumentRole = z.infer<typeof DocumentRole>;

export const ShareDocumentSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'commenter', 'viewer']),
});

export type ShareDocumentInput = z.infer<typeof ShareDocumentSchema>;

export const PermissionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  linkToken: z.string().nullable(),
  role: DocumentRole,
  createdAt: z.string().datetime(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().nullable(),
  }).nullable().optional(),
});

export type Permission = z.infer<typeof PermissionSchema>;

export const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
};
