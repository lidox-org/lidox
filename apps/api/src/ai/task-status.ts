import type { AiTaskResult } from '@lidox/types';

export function createQueuedTaskResult(taskId: string): AiTaskResult {
  return {
    taskId,
    status: 'queued',
  };
}

export function createProcessingTaskResult(input: {
  taskId: string;
  result?: string;
  modelUsed?: string;
}): AiTaskResult {
  return {
    taskId: input.taskId,
    status: 'processing',
    result: input.result,
    modelUsed: input.modelUsed,
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
