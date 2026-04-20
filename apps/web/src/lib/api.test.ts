import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, fetchWithAuthRetry, resolveApiUrl } from './api';

describe('resolveApiUrl', () => {
  it('prefixes app-relative API paths once', () => {
    expect(resolveApiUrl('/documents/doc-1')).toBe('/api/documents/doc-1');
  });

  it('does not double-prefix already-prefixed API paths', () => {
    expect(resolveApiUrl('/api/documents/doc-1')).toBe('/api/documents/doc-1');
  });
});

describe('API helpers', () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('uses the normalized URL for JSON API requests', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api('/api/documents/doc-1', { skipAuth: true });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('uses the normalized URL for streaming requests', async () => {
    fetchMock.mockResolvedValue(
      new Response('event: message\ndata: {"type":"complete"}\n\n', {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithAuthRetry('/api/documents/doc-1/ai/tasks/task-1/stream', {
      method: 'GET',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-1/ai/tasks/task-1/stream',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });
});
