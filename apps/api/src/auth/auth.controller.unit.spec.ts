import type { Request, Response } from 'express';

jest.mock('../config/database', () => ({
  db: {},
}));
jest.mock('../config/redis', () => ({
  redis: {
    sadd: jest.fn(),
    expire: jest.fn(),
    sismember: jest.fn(),
  },
}));

import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

const AUTH_RESULT = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'qa@example.com',
    name: 'QA User',
    avatarUrl: null,
  },
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
};

describe('AuthController', () => {
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
  } as unknown as AuthService;

  const controller = new AuthController(authService);

  const createResponse = (): Response =>
    ({
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    }) as unknown as Response;

  const createRequest = (cookies: Record<string, string> = {}): Request =>
    ({ cookies }) as unknown as Request;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets access and refresh cookies for login without returning the access token in JSON', async () => {
    (authService.login as jest.Mock).mockResolvedValue(AUTH_RESULT);
    const response = createResponse();

    const result = await controller.login(
      { email: 'qa@example.com', password: 'password123' },
      response,
    );

    expect(result).toEqual({ user: AUTH_RESULT.user });
    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'access_token',
      AUTH_RESULT.accessToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'refresh_token',
      AUTH_RESULT.refreshToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/auth/refresh',
      }),
    );
  });

  it('returns the authenticated user on refresh after rotating both cookies', async () => {
    (authService.refresh as jest.Mock).mockResolvedValue(AUTH_RESULT);
    const response = createResponse();

    const result = await controller.refresh(
      createRequest({
        refresh_token: AUTH_RESULT.refreshToken,
      }),
      response,
    );

    expect(result).toEqual({ user: AUTH_RESULT.user });
    expect(authService.refresh).toHaveBeenCalledWith(AUTH_RESULT.refreshToken);
    expect(response.cookie).toHaveBeenCalledTimes(2);
  });

  it('clears both auth cookies on logout', async () => {
    const response = createResponse();

    const result = await controller.logout(createRequest(), response);

    expect(result).toEqual({ message: 'Logged out' });
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      1,
      'access_token',
      expect.objectContaining({
        sameSite: 'strict',
        path: '/',
      }),
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      2,
      'refresh_token',
      expect.objectContaining({
        sameSite: 'strict',
        path: '/api/auth/refresh',
      }),
    );
  });
});
