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

export interface AiProviderAdapter {
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
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
    const { system, user } = buildPromptMessages(
      request.taskType,
      request.selection,
      request.language,
    );
    const model = MODEL_FOR_TASK[request.taskType] ?? this.defaultModel;

    if (!this.apiKey) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const result = getMockResponse(
        request.taskType,
        request.selection,
        request.language,
      );

      return {
        result,
        inputTokens: Math.ceil((system.length + user.length) / 4),
        outputTokens: Math.ceil(result.length / 4),
        model: 'mock',
      };
    }

    const completion = await this.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    });

    return {
      result: completion.choices[0]?.message?.content ?? '',
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model,
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
