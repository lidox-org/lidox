import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis';
import { DocumentsService } from '../documents/documents.service';
import {
  ROLE_HIERARCHY,
  AI_WRITE_TASKS,
  AI_READ_TASKS,
} from '@lidox/types';
import type { AiInvokeInput, AiTaskResult } from '@lidox/types';
import type { AiJobData } from './ai.processor';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly queue: Queue<AiJobData>;

  constructor(private readonly documentsService: DocumentsService) {
    this.queue = new Queue<AiJobData>('ai-tasks', {
      connection: redis,
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Invoke an AI task                                                */
  /* ---------------------------------------------------------------- */
  async invoke(docId: string, input: AiInvokeInput, userId: string) {
    // Check document exists and AI is enabled
    const doc = await this.documentsService.findDocument(docId);

    if (!doc.aiEnabled) {
      throw new ForbiddenException('AI features are disabled for this document');
    }

    // Check user permission
    const role = await this.documentsService.getUserRole(docId, userId);

    if (!role) {
      throw new ForbiddenException('No access to this document');
    }

    // Write tasks require editor+, read tasks require commenter+
    const isWriteTask = (AI_WRITE_TASKS as readonly string[]).includes(input.task);
    const isReadTask = (AI_READ_TASKS as readonly string[]).includes(input.task);

    if (isWriteTask && ROLE_HIERARCHY[role] < ROLE_HIERARCHY['editor']) {
      throw new ForbiddenException('Editor access required for write AI tasks');
    }

    if (isReadTask && ROLE_HIERARCHY[role] < ROLE_HIERARCHY['commenter']) {
      throw new ForbiddenException('Commenter access required for read AI tasks');
    }

    // Create task
    const taskId = uuidv4();

    // Store initial status in Redis
    await redis.set(
      `ai:task:${taskId}`,
      JSON.stringify({ taskId, status: 'queued' }),
      'EX',
      3600,
    );

    // Dispatch BullMQ job
    await this.queue.add('process', {
      taskId,
      documentId: docId,
      userId,
      taskType: input.task,
      selection: input.selection,
      language: input.language,
    });

    this.logger.log(`AI task ${taskId} queued (${input.task})`);

    return { taskId, status: 'queued' as const };
  }

  /* ---------------------------------------------------------------- */
  /*  Get task status                                                  */
  /* ---------------------------------------------------------------- */
  async getTaskStatus(docId: string, taskId: string, userId: string): Promise<AiTaskResult> {
    // Verify user has access to the document
    const role = await this.documentsService.getUserRole(docId, userId);
    if (!role) {
      throw new ForbiddenException('No access to this document');
    }

    const cached = await redis.get(`ai:task:${taskId}`);
    if (!cached) {
      throw new NotFoundException('Task not found or expired');
    }

    return JSON.parse(cached) as AiTaskResult;
  }
}
