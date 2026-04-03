import type { AiTaskType } from '@lidox/types';

interface PromptTemplate {
  system: string;
  user: (selection: string, language?: string) => string;
}

export const PROMPT_TEMPLATES: Record<AiTaskType, PromptTemplate> = {
  rewrite: {
    system:
      'You are a professional writing assistant. Rewrite the given text to improve clarity, flow, and readability while preserving the original meaning and tone.',
    user: (selection) =>
      `Please rewrite the following text:\n\n---\n${selection}\n---`,
  },

  summarize: {
    system:
      'You are a concise summarisation assistant. Produce a clear, structured summary of the provided text. Use bullet points for key takeaways when appropriate.',
    user: (selection) =>
      `Please summarize the following text:\n\n---\n${selection}\n---`,
  },

  translate: {
    system:
      'You are a professional translator. Translate the given text accurately, preserving formatting and nuance.',
    user: (selection, language) =>
      `Translate the following text to ${language || 'English'}:\n\n---\n${selection}\n---`,
  },

  grammar: {
    system:
      'You are a grammar and spelling assistant. Fix all grammatical errors, typos, and punctuation issues in the text. Return only the corrected text.',
    user: (selection) =>
      `Fix the grammar and spelling in the following text:\n\n---\n${selection}\n---`,
  },

  restructure: {
    system:
      'You are a document structure assistant. Reorganise the given text into a clearer, more logical structure. Add headings, break up long paragraphs, and improve overall flow.',
    user: (selection) =>
      `Please restructure the following text for better organisation:\n\n---\n${selection}\n---`,
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
