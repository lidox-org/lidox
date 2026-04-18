import Groq from 'groq-sdk';
import type { AiTaskType } from '@lidox/types';
import { env } from '../config/env';
import { buildPromptMessages } from './prompt-registry';

export interface AiProviderRequest {
  taskType: AiTaskType;
  selection: string;
  language?: string;
}

export interface AiProviderResponse {
  result: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AiProviderStream {
  model: string;
  inputTokens: number;
  chunks: AsyncIterable<string>;
}

export interface AiProviderAdapter {
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
  stream(request: AiProviderRequest): Promise<AiProviderStream>;
}

const MODEL_FOR_TASK: Record<AiTaskType, string> = {
  grammar: 'llama-3.1-8b-instant',
  explain: 'llama-3.1-8b-instant',
  rewrite: 'llama-3.3-70b-versatile',
  summarize: 'llama-3.3-70b-versatile',
  translate: 'llama-3.3-70b-versatile',
  restructure: 'llama-3.3-70b-versatile',
  analyze: 'llama-3.3-70b-versatile',
};

function getMockResponse(
  taskType: AiTaskType,
  selection: string,
  language?: string,
): string {
  const responses: Record<AiTaskType, string> = {
    rewrite: `[Rewritten] ${selection.slice(0, 200)}... (improved for clarity and flow)`,
    summarize:
      'Summary:\n- Key point from the text\n- Another important finding\n- Overall conclusion based on the content',
    translate: `[Translated to ${language || 'English'}] ${selection.slice(0, 200)}...`,
    grammar: `${selection.replace(/\s{2,}/g, ' ').trim()} [grammar corrected]`,
    restructure: `## Main Section\n\n${selection.slice(0, 100)}...\n\n## Details\n\nAdditional restructured content.`,
    analyze:
      'Analysis:\n- Theme: The text discusses important topics\n- Strength: Well-structured argument\n- Suggestion: Consider adding more supporting evidence',
    explain: `In simple terms: ${selection.slice(0, 150)}... This means that the content is explaining a concept in an accessible way.`,
  };

  return responses[taskType];
}

export class GroqAiProviderAdapter implements AiProviderAdapter {
  private client: Groq | null = null;

  constructor(
    private readonly apiKey = env.GROQ_API_KEY,
    private readonly defaultModel = env.GROQ_DEFAULT_MODEL,
  ) {}

  async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    const stream = await this.stream(request);
    let result = '';

    for await (const chunk of stream.chunks) {
      result += chunk;
    }

    return {
      result,
      inputTokens: stream.inputTokens,
      outputTokens: estimateTokenCount(result),
      model: stream.model,
    };
  }

  async stream(request: AiProviderRequest): Promise<AiProviderStream> {
    const { system, user } = buildPromptMessages(
      request.taskType,
      request.selection,
      request.language,
    );
    const model = MODEL_FOR_TASK[request.taskType] ?? this.defaultModel;
    const inputTokens = estimateTokenCount(`${system}\n${user}`);

    if (!this.apiKey) {
      const result = getMockResponse(
        request.taskType,
        request.selection,
        request.language,
      );

      return {
        model: 'mock',
        inputTokens,
        chunks: streamMockResponse(result),
      };
    }

    const responseStream = await this.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2048,
      temperature: 0.7,
      stream: true,
    });

    return {
      model,
      inputTokens,
      chunks: streamGroqResponse(responseStream),
    };
  }

  private getClient(): Groq {
    if (!this.client) {
      this.client = new Groq({ apiKey: this.apiKey });
    }

    return this.client;
  }
}

export function createDefaultAiProvider(): AiProviderAdapter {
  return new GroqAiProviderAdapter();
}

async function* streamMockResponse(
  result: string,
): AsyncIterable<string> {
  const chunkSize = 24;

  for (let index = 0; index < result.length; index += chunkSize) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    yield result.slice(index, index + chunkSize);
  }
}

async function* streamGroqResponse(
  stream: Awaited<ReturnType<Groq['chat']['completions']['create']>>,
): AsyncIterable<string> {
  for await (const chunk of stream as AsyncIterable<{
    choices?: Array<{ delta?: { content?: string | null } }>;
  }>) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
