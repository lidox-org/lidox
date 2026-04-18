import type { MessageEvent } from '@nestjs/common';
import {
  AiTaskEventSchema,
  type AiTaskEvent,
  type AiTaskEventType,
} from '@lidox/types';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import { redis } from '../config/redis';

const EVENT_TTL_SECONDS = 3600;
const EVENT_BUFFER_LIMIT = 512;
const STREAM_BLOCK_TIMEOUT_MS = 1000;
const TERMINAL_EVENTS = new Set<AiTaskEventType>([
  'complete',
  'failed',
  'cancelled',
]);

type RedisStreamEntry = [id: string, fields: string[]];
type RedisStreamResponse = Array<[stream: string, entries: RedisStreamEntry[]]>;

interface BufferedAiTaskEvent {
  id: string;
  event: AiTaskEvent;
}

function eventStreamKey(taskId: string): string {
  return `ai:events:${taskId}:stream`;
}

export function isTerminalAiTaskEvent(event: AiTaskEvent): boolean {
  return TERMINAL_EVENTS.has(event.type);
}

export async function publishAiTaskEvent(event: AiTaskEvent): Promise<void> {
  const streamKey = eventStreamKey(event.taskId);
  const payload = JSON.stringify(event);

  await redis.xadd(
    streamKey,
    'MAXLEN',
    '~',
    EVENT_BUFFER_LIMIT,
    '*',
    'event',
    payload,
  );
  await redis.expire(streamKey, EVENT_TTL_SECONDS);
}

export async function readBufferedAiTaskEvents(
  taskId: string,
): Promise<AiTaskEvent[]> {
  const buffered = await readBufferedAiTaskEventEntries(redis, taskId);
  return buffered.map((entry) => entry.event);
}

export function createAiTaskEventStream(
  taskId: string,
): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => {
    const subscription = redis.duplicate();
    let cleanedUp = false;

    const emitEvent = (event: AiTaskEvent) => {
      subscriber.next({
        type: event.type,
        data: event,
      });

      if (isTerminalAiTaskEvent(event)) {
        subscriber.complete();
        void cleanup();
      }
    };

    const cleanup = async () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      subscription.disconnect();
    };

    const start = async () => {
      await ensureRedisConnection(subscription);

      const bufferedEntries = await readBufferedAiTaskEventEntries(
        subscription,
        taskId,
      );
      let lastEventId =
        bufferedEntries[bufferedEntries.length - 1]?.id ?? '0-0';

      for (const entry of bufferedEntries) {
        emitEvent(entry.event);
        if (isTerminalAiTaskEvent(entry.event)) {
          return;
        }
      }

      while (!cleanedUp) {
        const liveEntries = await readNextAiTaskEventEntries(
          subscription,
          taskId,
          lastEventId,
        );

        for (const entry of liveEntries) {
          lastEventId = entry.id;
          emitEvent(entry.event);
          if (isTerminalAiTaskEvent(entry.event)) {
            return;
          }
        }
      }
    };

    void start().catch(async (error) => {
      if (!cleanedUp) {
        subscriber.error(error);
      }
      await cleanup();
    });

    return () => {
      void cleanup();
    };
  });
}

async function ensureRedisConnection(client: Redis): Promise<void> {
  if (client.status === 'wait') {
    await client.connect();
  }
}

async function readBufferedAiTaskEventEntries(
  client: Redis,
  taskId: string,
): Promise<BufferedAiTaskEvent[]> {
  const entries = (await client.xrange(
    eventStreamKey(taskId),
    '-',
    '+',
  )) as RedisStreamEntry[];

  return entries.map(parseBufferedAiTaskEvent);
}

async function readNextAiTaskEventEntries(
  client: Redis,
  taskId: string,
  lastEventId: string,
): Promise<BufferedAiTaskEvent[]> {
  const response = (await client.xread(
    'COUNT',
    EVENT_BUFFER_LIMIT,
    'BLOCK',
    STREAM_BLOCK_TIMEOUT_MS,
    'STREAMS',
    eventStreamKey(taskId),
    lastEventId,
  )) as RedisStreamResponse | null;

  if (!response) {
    return [];
  }

  return response.flatMap(([, entries]) => entries.map(parseBufferedAiTaskEvent));
}

function parseBufferedAiTaskEvent(entry: RedisStreamEntry): BufferedAiTaskEvent {
  const [id, fields] = entry;
  const payload = readStreamField(fields, 'event');

  return {
    id,
    event: AiTaskEventSchema.parse(JSON.parse(payload)),
  };
}

function readStreamField(fields: string[], name: string): string {
  for (let index = 0; index < fields.length; index += 2) {
    if (fields[index] === name) {
      const value = fields[index + 1];
      if (value !== undefined) {
        return value;
      }
    }
  }

  throw new Error(`Missing ${name} field in stored AI task event`);
}
