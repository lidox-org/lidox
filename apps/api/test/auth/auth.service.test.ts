/**
 * Auth controller tests: verify cookie-based auth flow without hitting a real DB.
 * Tests the controller layer (constructor-injected service) following the same
 * pattern established in test/ai/ai.controller.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller';
import type { AuthService } from '../../src/auth/auth.service';
import { createAsyncSpy } from '../helpers/spy';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const AUTH_RESULT = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@example.com',
    name: 'Alice',
    avatarUrl: null,
  },
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};

function createResponse(): Response {
  const cookies: Record<string, unknown> = {};
  const cleared: string[] = [];
  return {
    cookie: (name: string, value: string, opts: unknown) => {
      cookies[name] = { value, opts };
    },
    clearCookie: (name: string) => {
      cleared.push(name);
    },
    _cookies: cookies,
    _cleared: cleared,
  } as unknown as Response;
}

function createRequest(cookieMap: Record<string, string> = {}): Request {
  return { cookies: cookieMap, body: {} } as unknown as Request;
}

function makeService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    register: async () => {
      throw new Error('not used');
    },
    login: async () => {
      throw new Error('not used');
    },
    refresh: async () => {
      throw new Error('not used');
    },
    changePassword: async () => {
      throw new Error('not used');
    },
    denyJti: async () => {
      throw new Error('not used');
    },
    isJtiDenied: async () => false,
    ...overrides,
  } as unknown as AuthService;
}

/* ------------------------------------------------------------------ */
/*  Tests: register — input validation                                 */
/* ------------------------------------------------------------------ */

test('AuthController.register rejects an empty body with BadRequestException', async () => {
  const controller = new AuthController(makeService());
  const res = createResponse();

  await assert.rejects(
    () => controller.register({}, res),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('AuthController.register rejects a body missing required fields', async () => {
  const controller = new AuthController(makeService());
  const res = createResponse();

  await assert.rejects(
    () => controller.register({ email: 'alice@example.com' }, res),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('AuthController.register sets httpOnly access and refresh cookies on success', async () => {
  const registerSpy = createAsyncSpy(async () => AUTH_RESULT);
  const controller = new AuthController(makeService({ register: registerSpy.fn }));
  const res = createResponse();

  const result = await controller.register(
    { email: 'alice@example.com', password: 'StrongPass1!', name: 'Alice' },
    res,
  );

  assert.deepEqual(result, { user: AUTH_RESULT.user });

  const cookieRes = res as unknown as { _cookies: Record<string, { value: string; opts: { httpOnly: boolean; path: string } }> };
  assert.ok(cookieRes._cookies.access_token, 'access_token cookie should be set');
  assert.ok(cookieRes._cookies.refresh_token, 'refresh_token cookie should be set');
  assert.equal(cookieRes._cookies.access_token.value, AUTH_RESULT.accessToken);
  assert.equal(cookieRes._cookies.refresh_token.value, AUTH_RESULT.refreshToken);
  assert.equal(cookieRes._cookies.access_token.opts.httpOnly, true);
  assert.equal(cookieRes._cookies.refresh_token.opts.httpOnly, true);
  assert.equal(cookieRes._cookies.refresh_token.opts.path, '/api/auth/refresh');
});

/* ------------------------------------------------------------------ */
/*  Tests: login — cookie behavior                                     */
/* ------------------------------------------------------------------ */

test('AuthController.login rejects invalid payload', async () => {
  const controller = new AuthController(makeService());
  const res = createResponse();

  await assert.rejects(
    () => controller.login({ email: 'not-an-email', password: '' }, res),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('AuthController.login does NOT include tokens in the JSON response body', async () => {
  const loginSpy = createAsyncSpy(async () => AUTH_RESULT);
  const controller = new AuthController(makeService({ login: loginSpy.fn }));
  const res = createResponse();

  const result = await controller.login(
    { email: 'alice@example.com', password: 'StrongPass1!' },
    res,
  );

  // Tokens must NOT appear in the JSON body (cookie-only auth)
  const body = result as Record<string, unknown>;
  assert.ok(!('accessToken' in body), 'accessToken must not be in response body');
  assert.ok(!('refreshToken' in body), 'refreshToken must not be in response body');
  assert.deepEqual(result, { user: AUTH_RESULT.user });
});

test('AuthController.login sets both cookies on success', async () => {
  const loginSpy = createAsyncSpy(async () => AUTH_RESULT);
  const controller = new AuthController(makeService({ login: loginSpy.fn }));
  const res = createResponse();

  await controller.login({ email: 'alice@example.com', password: 'StrongPass1!' }, res);

  const cookieRes = res as unknown as { _cookies: Record<string, { value: string }> };
  assert.equal(cookieRes._cookies.access_token.value, AUTH_RESULT.accessToken);
  assert.equal(cookieRes._cookies.refresh_token.value, AUTH_RESULT.refreshToken);
});

/* ------------------------------------------------------------------ */
/*  Tests: refresh — token rotation and cookie-only delivery          */
/* ------------------------------------------------------------------ */

test('AuthController.refresh throws UnauthorizedException when no refresh token in cookie', async () => {
  const controller = new AuthController(makeService());
  const res = createResponse();

  await assert.rejects(
    () => controller.refresh(createRequest(), res),
    (err: unknown) => err instanceof UnauthorizedException,
  );
});

test('AuthController.refresh reads token from cookie and rotates both cookies', async () => {
  const refreshSpy = createAsyncSpy(async () => AUTH_RESULT);
  const controller = new AuthController(makeService({ refresh: refreshSpy.fn }));
  const res = createResponse();

  const result = await controller.refresh(
    createRequest({ refresh_token: AUTH_RESULT.refreshToken }),
    res,
  );

  assert.deepEqual(result, { user: AUTH_RESULT.user });
  assert.deepEqual(refreshSpy.calls, [[AUTH_RESULT.refreshToken]]);

  const cookieRes = res as unknown as { _cookies: Record<string, { value: string }> };
  assert.equal(cookieRes._cookies.access_token.value, AUTH_RESULT.accessToken);
  assert.equal(cookieRes._cookies.refresh_token.value, AUTH_RESULT.refreshToken);
});

/* ------------------------------------------------------------------ */
/*  Tests: logout — clears both cookies                               */
/* ------------------------------------------------------------------ */

test('AuthController.logout clears both auth cookies and returns confirmation', async () => {
  const controller = new AuthController(makeService());
  const res = createResponse();

  const result = await controller.logout(createRequest(), res);

  assert.deepEqual(result, { message: 'Logged out' });

  const cookieRes = res as unknown as { _cleared: string[] };
  assert.ok(cookieRes._cleared.includes('access_token'), 'access_token cookie should be cleared');
  assert.ok(cookieRes._cleared.includes('refresh_token'), 'refresh_token cookie should be cleared');
});

/* ------------------------------------------------------------------ */
/*  Tests: refresh reuse detection — service propagates error          */
/* ------------------------------------------------------------------ */

test('AuthController.refresh propagates UnauthorizedException from service (reuse detection)', async () => {
  const controller = new AuthController(
    makeService({
      refresh: async () => {
        throw new UnauthorizedException('Refresh token reuse detected');
      },
    }),
  );
  const res = createResponse();

  await assert.rejects(
    () => controller.refresh(createRequest({ refresh_token: 'stolen-token' }), res),
    (err: unknown) =>
      err instanceof UnauthorizedException &&
      (err as UnauthorizedException).message === 'Refresh token reuse detected',
  );
});
