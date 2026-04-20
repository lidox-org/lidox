# Lidox FastAPI Backend

This app is the FastAPI backend for the Lidox Assignment 2 submission. It is
the default backend started by `./run.sh` / `npm run dev`, while the older
NestJS code remains in the repo only as legacy reference code.

## Current scope

- FastAPI application with documented OpenAPI output
- `.env` loading aligned to the repo root
- JWT cookie auth with refresh/logout helpers
- Google OAuth start/callback flow that issues the same HttpOnly session cookies
- document CRUD, sharing, versions, and restore route coverage
- PDF export endpoint for the current editor content
- AI invoke/status/stream/cancel/review/history routes
- health and auth-check routes for smoke verification
- pytest coverage for auth, RBAC, and AI route lifecycles

## Run locally

```bash
cd apps/api-fastapi
python3.12 -m pip install fastapi "uvicorn[standard]" pydantic-settings email-validator httpx PyJWT "psycopg[binary]" redis bcrypt pytest
python3.12 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

The app reads the monorepo `.env` by default. To avoid clashing with the
launcher defaults, you can either use `API_PORT` or override FastAPI explicitly
with `FASTAPI_PORT`.

## Test locally

```bash
cd apps/api-fastapi
python3.12 -m pytest tests
```

To point the Vite frontend at a non-default FastAPI port during local dev:

```bash
cd /path/to/lidox
VITE_API_PROXY_TARGET=http://localhost:8001 npm --workspace @lidox/web run dev
```
