# JWT lifecycle and API authentication

This describes **actual** behavior in the runnable repo (`apps/api-fastapi`, `apps/web`, `apps/sync-server`). It is not the Assignment 1 LaTeX spec.

## Token types

| Token | Where it lives | Purpose |
|--------|----------------|---------|
| Access JWT | HttpOnly cookie `access_token` (path `/`) | Sent automatically on REST requests and Hocuspocus upgrade requests |
| Refresh token | HttpOnly cookie `refresh_token` (path `/api/auth/refresh`) | Silent session rotation via `POST /api/auth/refresh` |

## Lifecycle (happy path)

1. **Register / login** — `POST /api/auth/register` or `/api/auth/login` returns `{ user }` and sets both auth cookies.
2. **Authenticated requests** — `fetch` to `/api/...` uses `credentials: 'include'`, so the browser sends the access cookie automatically.
3. **401 handling** — `api()` retries once after `POST /api/auth/refresh`; on failure, the app redirects to `/login`.
4. **Logout** — `POST /api/auth/logout` clears both auth cookies.

## Collaboration (Hocuspocus)

The WebSocket server does **not** use the refresh cookie for authentication. It reads the **access** cookie from the upgrade request, verifies the JWT signature, and optionally checks the Redis deny list for revoked JTIs.

## Practical Q&A

- **Why both cookies?** The access cookie handles normal authenticated calls, while the refresh cookie is path-scoped to the refresh route for session rotation.
- **Is the access token in localStorage?** No. The runnable app keeps both auth tokens in HttpOnly cookies, not in browser storage or frontend state.
