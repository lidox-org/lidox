import { Worker, Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import Groq from 'groq-sdk';
import { redis } from '../config/redis';
import { db } from '../config/database';
import { aiInteractions } from '../db/schema';
import { PROMPT_TEMPLATES } from './prompts';
import { env } from '../config/env';
import type { AiTaskType } from '@lidox/types';

const logger = new Logger('AiProcessor');

export interface AiJobData {
  taskId: string;
  documentId: string;
  userId: string;
  taskType: AiTaskType;
  selection: string;
  language?: string;
}

/** Model routing per spec: fast tasks use smaller model, others use standard */
const MODEL_FOR_TASK: Record<string, string> = {
  grammar: 'llama-3.1-8b-instant',
  explain: 'llama-3.1-8b-instant',
  rewrite: 'llama-3.3-70b-versatile',
  summarize: 'llama-3.3-70b-versatile',
  translate: 'llama-3.3-70b-versatile',
  restructure: 'llama-3.3-70b-versatile',
  analyze: 'llama-3.3-70b-versatile',
};

/** Groq client (lazy — only instantiated when key is present) */
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  if (!env.GROQ_API_KEY) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Call Groq API for a given AI task.
 * Falls back to mock response if GROQ_API_KEY is not configured.
 */
async function callLlm(
  taskType: AiTaskType,
  selection: string,
  language?: string,
): Promise<{ result: string; inputTokens: number; outputTokens: number; model: string }> {
  const prompt = PROMPT_TEMPLATES[taskType];
  const userMessage = prompt.user(selection, language);
  const model = MODEL_FOR_TASK[taskType] ?? env.GROQ_DEFAULT_MODEL;

  const groq = getGroqClient();

  if (!groq) {
    // No API key configured — use mock response with warning
    logger.warn('GROQ_API_KEY not set — returning mock AI response. Set it in .env to enable real AI.');
    await new Promise((r) => setTimeout(r, 800));
    const inputTokens = Math.ceil((prompt.system.length + userMessage.length) / 4);
    const mockResult = getMockResponse(taskType, selection, language);
    return { result: mockResult, inputTokens, outputTokens: Math.ceil(mockResult.length / 4), model: 'mock' };
  }

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 2048,
    temperature: 0.7,
  });

  const result = completion.choices[0]?.message?.content ?? '';
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;

  return { result, inputTokens, outputTokens, model };
}

function getMockResponse(taskType: AiTaskType, selection: string, language?: string): string {
  const responses: Record<string, string> = {
    rewrite: `[Rewritten] ${selection.slice(0, 200)}... (improved for clarity and flow)`,
    summarize: `Summary:\n- Key point from the text\n- Another important finding\n- Overall conclusion based on the content`,
    translate: `[Translated to ${language || 'English'}] ${selection.slice(0, 200)}...`,
    grammar: selection.replace(/\s{2,}/g, ' ').trim() + ' [grammar corrected]',
    restructure: `## Main Section\n\n${selection.slice(0, 100)}...\n\n## Details\n\nAdditional restructured content.`,
    analyze: `Analysis:\n- Theme: The text discusses important topics\n- Strength: Well-structured argument\n- Suggestion: Consider adding more supporting evidence`,
    explain: `In simple terms: ${selection.slice(0, 150)}... This means that the content is explaining a concept in an accessible way.`,
  };
  return responses[taskType] ?? `[${taskType}] Processed result`;
}

/**
 * Create and start the BullMQ worker for AI tasks.
 */
export function startAiWorker(): Worker {
  const worker = new Worker<AiJobData>(
    'ai-tasks',
    async (job: Job<AiJobData>) => {
      const { taskId, documentId, userId, taskType, selection, language } = job.data;

      logger.log(`Processing AI task ${taskId} (${taskType})`);

      // Update status to processing
      await redis.set(
        `ai:task:${taskId}`,
        JSON.stringify({ taskId, status: 'processing' }),
        'EX',
        3600,
      );

      try {
        const { result, inputTokens, outputTokens, model } = await callLlm(
          taskType,
          selection,
          language,
        );

        // Groq pricing approximation: ~$0.05-0.27 per million tokens
        // Use $0.10/M tokens as a conservative estimate for cost tracking
        const costCents = Math.ceil(((inputTokens + outputTokens) / 1_000_000) * 10);

        // Store result in Redis
        await redis.set(
          `ai:task:${taskId}`,
          JSON.stringify({
            taskId,
            status: 'completed',
            result,
            inputTokens,
            outputTokens,
            modelUsed: model,
          }),
          'EX',
          3600,
        );

        // Log to ai_interactions table
        await db.insert(aiInteractions).values({
          id: taskId,
          documentId,
          userId,
          taskType,
          inputTokens,
          outputTokens,
          modelUsed: model,
          costCents,
          status: 'accepted',
          sourceTextHash: sha256(selection),
        });

        logger.log(`AI task ${taskId} completed (model: ${model}, tokens: ${inputTokens}+${outputTokens})`);
      } catch (err) {
        logger.error(`AI task ${taskId} failed`, err);

        await redis.set(
          `ai:task:${taskId}`,
          JSON.stringify({
            taskId,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
          }),
          'EX',
          3600,
        );

        await db.insert(aiInteractions).values({
          id: taskId,
          documentId,
          userId,
          taskType,
          inputTokens: 0,
          outputTokens: 0,
          modelUsed: 'unknown',
          costCents: 0,
          status: 'rejected',
          sourceTextHash: sha256(selection),
        });

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

/** SHA-256 hash for source text deduplication / staleness detection */
function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
