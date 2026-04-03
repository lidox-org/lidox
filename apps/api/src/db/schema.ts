import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ------------------------------------------------------------------ */
/*  Organizations                                                      */
/* ------------------------------------------------------------------ */
export const organizations = pgTable('organizations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 200 }).notNull(),
  aiBudgetCents: integer('ai_budget_cents').notNull().default(10000),
  aiBudgetUsedCents: integer('ai_budget_used_cents').notNull().default(0),
  aiRetentionDays: integer('ai_retention_days').notNull().default(30),
});

/* ------------------------------------------------------------------ */
/*  Users                                                              */
/* ------------------------------------------------------------------ */
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 2048 }),
  orgId: uuid('org_id').references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Documents                                                          */
/* ------------------------------------------------------------------ */
export const documents = pgTable('documents', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar('title', { length: 500 }).notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  aiEnabled: boolean('ai_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/*  Document Versions                                                  */
/* ------------------------------------------------------------------ */
export const documentVersions = pgTable('document_versions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  snapshot: text('snapshot'), // CRDT binary as base64
  crdtClock: integer('crdt_clock').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Permissions                                                        */
/* ------------------------------------------------------------------ */
export const permissions = pgTable('permissions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  userId: uuid('user_id').references(() => users.id),
  linkToken: varchar('link_token', { length: 255 }),
  role: varchar('role', { length: 20 }).notNull(), // owner | editor | commenter | viewer
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  AI Interactions                                                    */
/* ------------------------------------------------------------------ */
export const aiInteractions = pgTable('ai_interactions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  taskType: varchar('task_type', { length: 50 }).notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  modelUsed: varchar('model_used', { length: 100 }).notNull(),
  costCents: integer('cost_cents').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  sourceTextHash: varchar('source_text_hash', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Refresh Tokens                                                     */
/* ------------------------------------------------------------------ */
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  familyId: uuid('family_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
});
