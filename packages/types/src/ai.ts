import { z } from 'zod';

export const AiTaskType = z.enum([
  'rewrite',
  'summarize',
  'translate',
  'grammar',
  'restructure',
  'analyze',
  'explain',
]);
export type AiTaskType = z.infer<typeof AiTaskType>;

export const AiTaskStatus = z.enum([
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);
export type AiTaskStatus = z.infer<typeof AiTaskStatus>;

export const AiInteractionStatus = z.enum([
  'pending',
  'accepted',
  'rejected',
  'partial',
  'failed',
  'cancelled',
  'expired',
]);
export type AiInteractionStatus = z.infer<typeof AiInteractionStatus>;

export const AiTaskEventType = z.enum([
  'queued',
  'started',
  'chunk',
  'complete',
  'failed',
  'cancelled',
]);
export type AiTaskEventType = z.infer<typeof AiTaskEventType>;

const AiTaskEventBaseSchema = z.object({
  taskId: z.string().uuid(),
});

export const AiTaskQueuedEventSchema = AiTaskEventBaseSchema.extend({
  type: z.literal('queued'),
});

export const AiTaskStartedEventSchema = AiTaskEventBaseSchema.extend({
  type: z.literal('started'),
  modelUsed: z.string().optional(),
});

export const AiTaskChunkEventSchema = AiTaskEventBaseSchema.extend({
  type: z.literal('chunk'),
  chunk: z.string().min(1),
});

export const AiTaskCompleteEventSchema = AiTaskEventBaseSchema.extend({
  type: z.literal('complete'),
  result: z.string(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  modelUsed: z.string().optional(),
});

export const AiTaskFailedEventSchema = AiTaskEventBaseSchema.extend({
  type: z.literal('failed'),
  error: z.string().min(1),
});

export const AiTaskCancelledEventSchema = AiTaskEventBaseSchema.extend({
  type: z.literal('cancelled'),
  reason: z.string().optional(),
});

export const AiTaskEventSchema = z.discriminatedUnion('type', [
  AiTaskQueuedEventSchema,
  AiTaskStartedEventSchema,
  AiTaskChunkEventSchema,
  AiTaskCompleteEventSchema,
  AiTaskFailedEventSchema,
  AiTaskCancelledEventSchema,
]);
export type AiTaskEvent = z.infer<typeof AiTaskEventSchema>;

export const AiInvokeSchema = z.object({
  task: AiTaskType,
  selection: z.string().min(1).max(50000),
  selectionHtml: z.string().min(1).max(100000).optional(),
  nodeId: z.string().optional(),
  stateVector: z.string().optional(),
  language: z.string().optional(),
});

export type AiInvokeInput = z.infer<typeof AiInvokeSchema>;

export const AiInvokeResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: z.literal('queued'),
});

export type AiInvokeResponse = z.infer<typeof AiInvokeResponseSchema>;

export const AiCancelResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['cancelling', 'cancelled']),
});
export type AiCancelResponse = z.infer<typeof AiCancelResponseSchema>;

export const AiTaskResultSchema = z.object({
  taskId: z.string().uuid(),
  status: AiTaskStatus,
  result: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  modelUsed: z.string().optional(),
});

export type AiTaskResult = z.infer<typeof AiTaskResultSchema>;

export const AiTaskMetadataSchema = z.object({
  taskId: z.string().uuid(),
  documentId: z.string().uuid(),
  userId: z.string().uuid(),
  taskType: AiTaskType,
});
export type AiTaskMetadata = z.infer<typeof AiTaskMetadataSchema>;

export const AiProposalReviewAction = z.enum([
  'accept',
  'reject',
  'partial',
]);
export type AiProposalReviewAction = z.infer<typeof AiProposalReviewAction>;

export const AiProposalReviewSchema = z.object({
  action: AiProposalReviewAction,
  appliedText: z.string().min(1).optional(),
  currentSelection: z.string().optional(),
  currentStateVector: z.string().optional(),
});
export type AiProposalReviewInput = z.infer<typeof AiProposalReviewSchema>;

export const AiProposalReviewResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: AiInteractionStatus,
  stale: z.boolean(),
  appliedText: z.string().nullable().optional(),
});
export type AiProposalReviewResponse = z.infer<
  typeof AiProposalReviewResponseSchema
>;

export const AiInteractionHistoryItemSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  userId: z.string().uuid(),
  taskType: AiTaskType,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  modelUsed: z.string(),
  costCents: z.number().int().nonnegative(),
  status: AiInteractionStatus,
  sourceTextHash: z.string().nullable(),
  sourceText: z.string().nullable(),
  proposalText: z.string().nullable(),
  sourceStateVector: z.string().nullable(),
  appliedText: z.string().nullable(),
  staleAtReview: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AiInteractionHistoryItem = z.infer<
  typeof AiInteractionHistoryItemSchema
>;

export const AI_WRITE_TASKS: AiTaskType[] = ['rewrite', 'summarize', 'translate', 'grammar', 'restructure'];
export const AI_READ_TASKS: AiTaskType[] = ['analyze', 'explain'];

export const TOKEN_BUDGETS: Record<string, number> = {
  grammar: 800,
  rewrite: 4000,
  summarize: 8000,
  translate: 4000,
  restructure: 16000,
  analyze: 4000,
  explain: 4000,
};

export const MODEL_TIERS: Record<string, string> = {
  grammar: 'fast',
  rewrite: 'standard',
  summarize: 'standard',
  translate: 'standard',
  restructure: 'premium',
  analyze: 'standard',
  explain: 'fast',
};
