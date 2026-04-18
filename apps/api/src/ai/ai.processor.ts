import { Worker, Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { redis } from '../config/redis';
import { db } from '../config/database';
import { aiInteractions } from '../db/schema';
import type { AiTaskType } from '@lidox/types';
import { createDefaultAiProvider } from './provider-adapter';
import {
  buildFailedInteractionLog,
  buildPendingInteractionLog,
} from './interaction-log';
import {
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
      await redis.set(
        `ai:task:${taskId}`,
        JSON.stringify(createProcessingTaskResult(taskId)),
        'EX',
        3600,
      );

      try {
        const { result, inputTokens, outputTokens, model } =
          await provider.generate({
            taskType,
            selection,
            language,
          });

        // Groq pricing approximation: ~$0.05-0.27 per million tokens
        // Use $0.10/M tokens as a conservative estimate for cost tracking
        const costCents = Math.ceil(((inputTokens + outputTokens) / 1_000_000) * 10);

        // Store result in Redis
        await redis.set(
          `ai:task:${taskId}`,
          JSON.stringify(
            createCompletedTaskResult({
              taskId,
              result,
              inputTokens,
              outputTokens,
              modelUsed: model,
            }),
          ),
          'EX',
          3600,
        );

        // Log to ai_interactions table
        await db.insert(aiInteractions).values(
          buildPendingInteractionLog({
            taskId,
            documentId,
            userId,
            taskType,
            inputTokens,
            outputTokens,
            modelUsed: model,
            costCents,
            selection,
          }),
        );

        logger.log(`AI task ${taskId} completed (model: ${model}, tokens: ${inputTokens}+${outputTokens})`);
      } catch (err) {
        logger.error(`AI task ${taskId} failed`, err);

        await redis.set(
          `ai:task:${taskId}`,
          JSON.stringify(
            createFailedTaskResult(
              taskId,
              err instanceof Error ? err.message : 'Unknown error',
            ),
          ),
          'EX',
          3600,
        );

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
