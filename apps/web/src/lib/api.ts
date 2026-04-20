export const BASE_URL = '/api';
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

export function resolveApiUrl(path: string): string {
  if (ABSOLUTE_URL_PATTERN.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath === BASE_URL || normalizedPath.startsWith(`${BASE_URL}/`)) {
    return normalizedPath;
  }

  return `${BASE_URL}${normalizedPath}`;
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

interface FetchRetryOptions {
  redirectOnFailure?: boolean;
}

export async function api<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { skipAuth, ...init } = options;
  const headers = new Headers(init.headers);

  if (
    init.body &&
    typeof init.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const url = resolveApiUrl(path);

  let res = await fetch(url, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await fetch(url, { ...init, headers, credentials: 'include' });
    } else {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message || res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export async function fetchWithAuthRetry(
  path: string,
  options: FetchOptions = {},
  retryOptions: FetchRetryOptions = {},
): Promise<Response> {
  const { skipAuth, ...init } = options;
  const url = resolveApiUrl(path);

  let res = await fetch(url, { ...init, credentials: 'include' });

  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await fetch(url, { ...init, credentials: 'include' });
    } else if (retryOptions.redirectOnFailure) {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  return res;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
