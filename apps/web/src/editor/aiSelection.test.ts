import { describe, expect, it } from 'vitest';
import { normalizeAiReplacementHtml } from './aiSelection';

describe('normalizeAiReplacementHtml', () => {
  it('unwraps a block wrapper when the original selection is inline', () => {
    const normalized = normalizeAiReplacementHtml({
      originalHtml: 'Original text',
      proposedText: 'Improved text',
      proposedHtml: '<p>Improved <strong>text</strong></p>',
    });

    expect(normalized).toBe('Improved <strong>text</strong>');
  });

  it('decodes escaped html fragments from the model before applying them', () => {
    const normalized = normalizeAiReplacementHtml({
      originalHtml: 'Original text',
      proposedText: '<p>Improved text</p>',
      proposedHtml: '&lt;p&gt;Improved text&lt;/p&gt;',
    });

    expect(normalized).toBe('Improved text');
  });

  it('preserves block structure when the original selection is block-level', () => {
    const normalized = normalizeAiReplacementHtml({
      originalHtml: '<p>Original text</p>',
      proposedText: 'Improved text',
      proposedHtml: '<p>Improved text</p><p>Second paragraph</p>',
    });

    expect(normalized).toBe('<p>Improved text</p><p>Second paragraph</p>');
  });
});
