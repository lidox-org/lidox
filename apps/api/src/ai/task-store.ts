import {
  AiTaskMetadataSchema,
  AiTaskResultSchema,
  type AiTaskMetadata,
  type AiTaskResult,
} from '@lidox/types';
import { redis } from '../config/redis';

const TASK_TTL_SECONDS = 3600;

function taskStatusKey(taskId: string): string {
  return `ai:task:${taskId}`;
}

function taskMetadataKey(taskId: string): string {
  return `ai:task-meta:${taskId}`;
}

function taskCancelKey(taskId: string): string {
  return `ai:task-cancel:${taskId}`;
}

export async function storeAiTaskStatus(task: AiTaskResult): Promise<void> {
  await redis.set(
    taskStatusKey(task.taskId),
    JSON.stringify(task),
    'EX',
    TASK_TTL_SECONDS,
  );
}

export async function getAiTaskStatus(
  taskId: string,
): Promise<AiTaskResult | null> {
  const cached = await redis.get(taskStatusKey(taskId));
  if (!cached) {
    return null;
  }

  return AiTaskResultSchema.parse(JSON.parse(cached));
}

export async function storeAiTaskMetadata(
  task: AiTaskMetadata,
): Promise<void> {
  await redis.set(
    taskMetadataKey(task.taskId),
    JSON.stringify(task),
    'EX',
    TASK_TTL_SECONDS,
  );
}

export async function getAiTaskMetadata(
  taskId: string,
): Promise<AiTaskMetadata | null> {
  const cached = await redis.get(taskMetadataKey(taskId));
  if (!cached) {
    return null;
  }

  return AiTaskMetadataSchema.parse(JSON.parse(cached));
}

export async function requestAiTaskCancellation(taskId: string): Promise<void> {
  await redis.set(taskCancelKey(taskId), '1', 'EX', TASK_TTL_SECONDS);
}

export async function isAiTaskCancellationRequested(
  taskId: string,
): Promise<boolean> {
  const cancellationFlag = await redis.get(taskCancelKey(taskId));
  return cancellationFlag === '1';
}

export async function clearAiTaskCancellationRequest(
  taskId: string,
): Promise<void> {
  await redis.del(taskCancelKey(taskId));
}
