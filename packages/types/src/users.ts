import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable(),
  orgId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  aiBudgetCents: z.number().int().min(0),
  aiBudgetUsedCents: z.number().int().min(0),
  aiRetentionDays: z.number().int().min(0).max(365).default(30),
});

export type Organization = z.infer<typeof OrganizationSchema>;
