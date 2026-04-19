# Lidox FastAPI Foundation

This app is the staged FastAPI migration target for Assignment 2. It exists in
parallel with the current NestJS backend so the team can port behavior
incrementally without breaking the working demo path.

## Current scope

- FastAPI application scaffold
- `.env` loading aligned to the repo root
- OpenAPI docs at `/api/docs`
- shared settings, DB, Redis, and JWT/cookie auth helpers
- health and auth-check routes for smoke verification

## Run locally

```bash
cd apps/api-fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

The app reads the monorepo `.env` by default. To avoid clashing with the
existing NestJS service on `3001`, this scaffold prefers `FASTAPI_PORT` and
falls back to `API_PORT`.

