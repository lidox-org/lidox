import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, fetchWithAuthRetry, resolveApiUrl } from './api';

describe('resolveApiUrl', () => {
  it('prefixes relative API paths once', () => {
    expect(resolveApiUrl('/documents/doc-1')).toBe('/api/documents/doc-1');
    expect(resolveApiUrl('documents/doc-1')).toBe('/api/documents/doc-1');
  });

  it('keeps already-prefixed API paths unchanged', () => {
    expect(resolveApiUrl('/api/documents/doc-1')).toBe('/api/documents/doc-1');
    expect(resolveApiUrl('/api')).toBe('/api');
  });

  it('leaves absolute URLs untouched', () => {
    expect(resolveApiUrl('https://example.com/api/documents/doc-1')).toBe(
      'https://example.com/api/documents/doc-1',
    );
  });
});

describe('API helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a normalized URL for JSON API requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api('/api/documents/doc-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-1',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('does not double-prefix stream URLs when auth retry is used', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('', {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithAuthRetry('/api/documents/doc-1/ai/tasks/task-1/stream');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-1/ai/tasks/task-1/stream',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });
});
