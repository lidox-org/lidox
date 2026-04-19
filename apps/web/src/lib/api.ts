const BASE_URL = '/api';

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function redirectToLogin() {
  window.location.href = '/login';
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      const newToken = data.accessToken as string;
      setAccessToken(newToken);
      return newToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function ensureAccessToken(options?: {
  forceRefresh?: boolean;
  redirectOnFailure?: boolean;
}): Promise<string | null> {
  const forceRefresh = options?.forceRefresh ?? false;
  const redirectOnFailure = options?.redirectOnFailure ?? true;

  if (!forceRefresh && accessToken) {
    return accessToken;
  }

  const refreshed = await refreshAccessToken();
  if (refreshed) {
    return refreshed;
  }

  setAccessToken(null);
  if (redirectOnFailure) {
    redirectToLogin();
  }

  return null;
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options?: {
    skipAuth?: boolean;
    redirectOnFailure?: boolean;
  },
): Promise<Response> {
  const skipAuth = options?.skipAuth ?? false;
  const redirectOnFailure = options?.redirectOnFailure ?? true;
  const headers = new Headers(init.headers);

  if (!skipAuth && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });

  if (response.status !== 401 || skipAuth) {
    return response;
  }

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    setAccessToken(null);
    if (redirectOnFailure) {
      redirectToLogin();
    }
    throw new Error('Session expired');
  }

  headers.set('Authorization', `Bearer ${refreshed}`);

  response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });

  return response;
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

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const res = await fetchWithAuthRetry(
    url,
    { ...init, headers },
    { skipAuth },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message || res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
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
