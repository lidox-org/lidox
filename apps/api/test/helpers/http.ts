import type { Request } from 'express';

interface AuthenticatedUser {
  userId: string;
  email: string;
  jti: string;
}

interface RequestOverrides {
  user?: Partial<AuthenticatedUser>;
}

const DEFAULT_USER: AuthenticatedUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'tester@example.com',
  jti: 'test-jti',
};

export function createAuthenticatedRequest(
  overrides: RequestOverrides = {},
): Request {
  return {
    user: {
      ...DEFAULT_USER,
      ...overrides.user,
    },
  } as Request;
}
