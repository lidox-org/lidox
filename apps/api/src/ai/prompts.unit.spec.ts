import { PROMPT_TEMPLATES } from './prompts';

describe('PROMPT_TEMPLATES', () => {
  it('covers every supported AI task', () => {
    expect(Object.keys(PROMPT_TEMPLATES).sort()).toEqual([
      'analyze',
      'explain',
      'grammar',
      'restructure',
      'rewrite',
      'summarize',
      'translate',
    ]);
  });

  it('defaults translation target language to English', () => {
    expect(PROMPT_TEMPLATES.translate.user('hola')).toContain('English');
  });

  it('injects the requested translation target language', () => {
    expect(PROMPT_TEMPLATES.translate.user('hola', 'Arabic')).toContain(
      'Arabic',
    );
  });
});
