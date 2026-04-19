import type { AiTaskType } from '@lidox/types';

export interface PromptTemplate {
  system: string;
  user: (selection: string, selectionHtml?: string, language?: string) => string;
}

const HTML_FRAGMENT_RULES = [
  'Return only a valid HTML fragment with no markdown fences or commentary.',
  'Preserve the existing structure and formatting tags whenever possible.',
  'Do not invent wrapper elements unless they are required to keep the fragment valid.',
  'Keep links, emphasis, headings, lists, and inline code as HTML.',
].join(' ');

function buildWriteTaskPrompt(
  instruction: string,
  selection: string,
  selectionHtml?: string,
): string {
  if (!selectionHtml) {
    return `${instruction}\n\n---\n${selection}\n---`;
  }

  return `${instruction}\n\nPlain text:\n---\n${selection}\n---\n\nHTML fragment:\n---\n${selectionHtml}\n---`;
}

const PROMPT_REGISTRY: Record<AiTaskType, PromptTemplate> = {
  rewrite: {
    system:
      `You are a professional writing assistant. Rewrite the given text to improve clarity, flow, and readability while preserving the original meaning and tone. ${HTML_FRAGMENT_RULES}`,
    user: (selection, selectionHtml) =>
      buildWriteTaskPrompt(
        'Please rewrite the following text.',
        selection,
        selectionHtml,
      ),
  },

  summarize: {
    system:
      `You are a concise summarisation assistant. Produce a clear, structured summary of the provided text. Use bullet points for key takeaways when appropriate. ${HTML_FRAGMENT_RULES}`,
    user: (selection, selectionHtml) =>
      buildWriteTaskPrompt(
        'Please summarize the following text.',
        selection,
        selectionHtml,
      ),
  },

  translate: {
    system:
      `You are a professional translator. Translate the given text accurately, preserving formatting and nuance. Translate the text content while keeping the HTML tags intact. ${HTML_FRAGMENT_RULES}`,
    user: (selection, selectionHtml, language) =>
      buildWriteTaskPrompt(
        `Translate the following text to ${language || 'English'}.`,
        selection,
        selectionHtml,
      ),
  },

  grammar: {
    system:
      `You are a grammar and spelling assistant. Fix all grammatical errors, typos, and punctuation issues in the text. ${HTML_FRAGMENT_RULES}`,
    user: (selection, selectionHtml) =>
      buildWriteTaskPrompt(
        'Fix the grammar and spelling in the following text.',
        selection,
        selectionHtml,
      ),
  },

  restructure: {
    system:
      `You are a document structure assistant. Reorganise the given text into a clearer, more logical structure. Add headings, break up long paragraphs, and improve overall flow. ${HTML_FRAGMENT_RULES}`,
    user: (selection, selectionHtml) =>
      buildWriteTaskPrompt(
        'Please restructure the following text for better organisation.',
        selection,
        selectionHtml,
      ),
  },

  analyze: {
    system:
      'You are an analytical assistant. Provide a thorough analysis of the given text including: main themes, argument strength, potential biases, and areas for improvement.',
    user: (selection) =>
      `Analyze the following text:\n\n---\n${selection}\n---`,
  },

  explain: {
    system:
      'You are an explanation assistant. Explain the given text in simple, accessible language. Clarify complex concepts, jargon, and technical terms.',
    user: (selection) =>
      `Explain the following text in simple terms:\n\n---\n${selection}\n---`,
  },
};

export const PROMPT_TEMPLATES = PROMPT_REGISTRY;

export function getPromptTemplate(taskType: AiTaskType): PromptTemplate {
  return PROMPT_REGISTRY[taskType];
}

export function buildPromptMessages(
  taskType: AiTaskType,
  selection: string,
  selectionHtml?: string,
  language?: string,
): { system: string; user: string } {
  const template = getPromptTemplate(taskType);

  return {
    system: template.system,
    user: template.user(selection, selectionHtml, language),
  };
}
