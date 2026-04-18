import * as crypto from 'crypto';
import type { AiTaskType } from '@lidox/types';
import { aiInteractions } from '../db/schema';

type AiInteractionInsert = typeof aiInteractions.$inferInsert;

interface BaseInteractionInput {
  taskId: string;
  documentId: string;
  userId: string;
  taskType: AiTaskType;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
  costCents: number;
  selection: string;
}

export function buildPendingInteractionLog(
  input: BaseInteractionInput,
): AiInteractionInsert {
  return {
    id: input.taskId,
    documentId: input.documentId,
    userId: input.userId,
    taskType: input.taskType,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    modelUsed: input.modelUsed,
    costCents: input.costCents,
    status: 'pending',
    sourceTextHash: sha256(input.selection),
  };
}

export function buildFailedInteractionLog(
  input: Omit<
    BaseInteractionInput,
    'inputTokens' | 'outputTokens' | 'modelUsed' | 'costCents'
  >,
): AiInteractionInsert {
  return {
    id: input.taskId,
    documentId: input.documentId,
    userId: input.userId,
    taskType: input.taskType,
    inputTokens: 0,
    outputTokens: 0,
    modelUsed: 'unknown',
    costCents: 0,
    status: 'failed',
    sourceTextHash: sha256(input.selection),
  };
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
