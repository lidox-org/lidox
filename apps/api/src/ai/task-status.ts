import type { AiTaskResult } from '@lidox/types';

export function createQueuedTaskResult(taskId: string): AiTaskResult {
  return {
    taskId,
    status: 'queued',
  };
}

export function createProcessingTaskResult(taskId: string): AiTaskResult {
  return {
    taskId,
    status: 'processing',
  };
}

export function createCompletedTaskResult(input: {
  taskId: string;
  result: string;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
}): AiTaskResult {
  return {
    taskId: input.taskId,
    status: 'completed',
    result: input.result,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    modelUsed: input.modelUsed,
  };
}

export function createFailedTaskResult(
  taskId: string,
  error: string,
): AiTaskResult {
  return {
    taskId,
    status: 'failed',
    error,
  };
}

export function createCancelledTaskResult(
  taskId: string,
  reason?: string,
): AiTaskResult {
  return {
    taskId,
    status: 'cancelled',
    error: reason,
  };
}
