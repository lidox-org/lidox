import test from 'node:test';
import assert from 'node:assert/strict';
import { AiTaskType } from '@lidox/types';
import { PROMPT_TEMPLATES } from '../../src/ai/prompts';

test('every registered AI task has a non-empty prompt template', () => {
  for (const task of AiTaskType.options) {
    const template = PROMPT_TEMPLATES[task];

    assert.ok(template, `missing prompt template for ${task}`);
    assert.notEqual(template.system.trim(), '');
    assert.notEqual(template.user('Sample text', 'Spanish').trim(), '');
  }
});

test('translate prompt includes the requested language', () => {
  const prompt = PROMPT_TEMPLATES.translate.user('Hello world', 'Uzbek');

  assert.match(prompt, /Uzbek/);
  assert.match(prompt, /Hello world/);
});
