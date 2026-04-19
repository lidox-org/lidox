import test from 'node:test';
import assert from 'node:assert/strict';
import { AiTaskType } from '@lidox/types';
import {
  PROMPT_TEMPLATES,
  buildPromptMessages,
  getPromptTemplate,
} from '../../src/ai/prompts';

test('every registered AI task has a non-empty prompt template', () => {
  for (const task of AiTaskType.options) {
    const template = PROMPT_TEMPLATES[task];

    assert.ok(template, `missing prompt template for ${task}`);
    assert.notEqual(template.system.trim(), '');
    assert.notEqual(
      template.user('Sample text', '<p>Sample text</p>', 'Spanish').trim(),
      '',
    );
  }
});

test('translate prompt includes the requested language', () => {
  const prompt = PROMPT_TEMPLATES.translate.user(
    'Hello world',
    '<p>Hello world</p>',
    'Uzbek',
  );

  assert.match(prompt, /Uzbek/);
  assert.match(prompt, /Hello world/);
  assert.match(prompt, /<p>Hello world<\/p>/);
});

test('write-task prompt builder includes the HTML fragment when provided', () => {
  const messages = buildPromptMessages(
    'rewrite',
    'Hello world',
    '<p><strong>Hello</strong> world</p>',
  );

  assert.match(messages.system, /valid HTML fragment/i);
  assert.match(messages.user, /HTML fragment/i);
  assert.match(messages.user, /<strong>Hello<\/strong>/);
});

test('prompt registry exposes lookup and message-building helpers', () => {
  const template = getPromptTemplate('rewrite');
  const messages = buildPromptMessages('rewrite', 'Hello world');

  assert.match(template.system, /writing assistant/i);
  assert.match(messages.system, /writing assistant/i);
  assert.match(messages.user, /Hello world/);
});
