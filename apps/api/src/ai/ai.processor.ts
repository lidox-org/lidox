import { Worker, Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { redis } from '../config/redis';
import { db } from '../config/database';
import { aiInteractions } from '../db/schema';
import type { AiTaskType } from '@lidox/types';
import {
  isAiTaskCancellationRequested,
  clearAiTaskCancellationRequest,
  storeAiTaskStatus,
} from './task-store';
import { createDefaultAiProvider } from './provider-adapter';
import { publishAiTaskEvent } from './ai-event-bus';
import {
  buildFailedInteractionLog,
  buildPendingInteractionLog,
} from './interaction-log';
import {
  createCancelledTaskResult,
  createCompletedTaskResult,
  createFailedTaskResult,
  createProcessingTaskResult,
} from './task-status';

const logger = new Logger('AiProcessor');

export interface AiJobData {
  taskId: string;
  documentId: string;
  userId: string;
  taskType: AiTaskType;
  selection: string;
  language?: string;
}

/**
 * Create and start the BullMQ worker for AI tasks.
 */
export function startAiWorker(): Worker {
  const provider = createDefaultAiProvider();

  const worker = new Worker<AiJobData>(
    'ai-tasks',
    async (job: Job<AiJobData>) => {
      const { taskId, documentId, userId, taskType, selection, language } = job.data;

      logger.log(`Processing AI task ${taskId} (${taskType})`);

      // Update status to processing
      await storeAiTaskStatus(createProcessingTaskResult({ taskId }));

      try {
        const stream = await provider.stream({
          taskType,
          selection,
          language,
        });

        let result = '';
        let outputTokens = 0;

        await publishAiTaskEvent({
          type: 'started',
          taskId,
          modelUsed: stream.model,
        });
        await storeAiTaskStatus(
          createProcessingTaskResult({
            taskId,
            result,
            modelUsed: stream.model,
          }),
        );

        for await (const chunk of stream.chunks) {
          if (await isAiTaskCancellationRequested(taskId)) {
            await handleCancelledTask(taskId);
            return;
          }

          result += chunk;
          outputTokens = Math.ceil(result.length / 4);

          await publishAiTaskEvent({
            type: 'chunk',
            taskId,
            chunk,
          });
          await storeAiTaskStatus(
            createProcessingTaskResult({
              taskId,
              result,
              modelUsed: stream.model,
            }),
          );
        }

        if (await isAiTaskCancellationRequested(taskId)) {
          await handleCancelledTask(taskId);
          return;
        }

        // Groq pricing approximation: ~$0.05-0.27 per million tokens
        // Use $0.10/M tokens as a conservative estimate for cost tracking
        const costCents = Math.ceil(
          ((stream.inputTokens + outputTokens) / 1_000_000) * 10,
        );
        const completedTask = createCompletedTaskResult({
          taskId,
          result,
          inputTokens: stream.inputTokens,
          outputTokens,
          modelUsed: stream.model,
        });

        // Store result in Redis
        await storeAiTaskStatus(completedTask);
        await publishAiTaskEvent({
          type: 'complete',
          taskId,
          result,
          inputTokens: stream.inputTokens,
          outputTokens,
          modelUsed: stream.model,
        });
        await clearAiTaskCancellationRequest(taskId);

        // Log to ai_interactions table
        await db.insert(aiInteractions).values(
          buildPendingInteractionLog({
            taskId,
            documentId,
            userId,
            taskType,
            inputTokens: stream.inputTokens,
            outputTokens,
            modelUsed: stream.model,
            costCents,
            selection,
          }),
        );

        logger.log(`AI task ${taskId} completed (model: ${stream.model}, tokens: ${stream.inputTokens}+${outputTokens})`);
      } catch (err) {
        logger.error(`AI task ${taskId} failed`, err);
        const error =
          err instanceof Error ? err.message : 'Unknown error';

        await storeAiTaskStatus(createFailedTaskResult(taskId, error));
        await publishAiTaskEvent({
          type: 'failed',
          taskId,
          error,
        });
        await clearAiTaskCancellationRequest(taskId);

        await db.insert(aiInteractions).values(
          buildFailedInteractionLog({
            taskId,
            documentId,
            userId,
            taskType,
            selection,
          }),
        );

        throw err;
      }
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  worker.on('error', (err) => {
    logger.error('AI worker error', err);
  });

  logger.log('AI worker started');

  return worker;
}

async function handleCancelledTask(taskId: string): Promise<void> {
  const cancelledTask = createCancelledTaskResult(
    taskId,
    'Generation cancelled by user',
  );

  await storeAiTaskStatus(cancelledTask);
  await publishAiTaskEvent({
    type: 'cancelled',
    taskId,
    reason: 'Generation cancelled by user',
  });
  await clearAiTaskCancellationRequest(taskId);
}
