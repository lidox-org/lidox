# JWT lifecycle and API authentication

This describes **actual** behavior in the repo (`apps/api`, `apps/web`, `apps/sync-server`). It is not the Assignment 1 LaTeX spec.

## Token types

| Token | Where it lives | Purpose |
|--------|----------------|---------|
| Access JWT | SPA memory (`setAccessToken` in `apps/web/src/lib/api.ts`) | `Authorization: Bearer` on REST API; passed to Hocuspocus as `token` |
| Refresh token | HttpOnly cookie `refresh_token` (path `/api/auth/refresh`) | New access JWT via `POST /api/auth/refresh` |

## Lifecycle (happy path)

1. **Register / login** — `POST /api/auth/register` or `/api/auth/login` returns `{ user, accessToken }` and sets the refresh cookie.
2. **Authenticated requests** — `fetch` to `/api/...` includes `Authorization: Bearer <accessToken>` and `credentials: 'include'` so the refresh cookie is available.
3. **401 handling** — `api()` retries once after `POST /api/auth/refresh` with the cookie; on failure, token is cleared and user is sent to `/login`.
4. **Logout** — `POST /api/auth/logout` clears the refresh cookie path; client clears the in-memory access token.

## Collaboration (Hocuspocus)

The WebSocket server does **not** use the refresh cookie for authentication. The client supplies the **access** JWT through the provider’s `token` field (`getOrCreateProvider` in `apps/web/src/lib/websocket.ts`). The sync server verifies the JWT signature and optional Redis deny list for revoked JTIs.

## Practical Q&A

- **Why both Bearer and cookies?** Access is Bearer for stateless API auth; refresh is HttpOnly to reduce XSS exfiltration risk.
- **Is the access token in localStorage?** No—in default code it is **memory-only** (lost on full page reload until `refresh` or re-login via app bootstrap).
