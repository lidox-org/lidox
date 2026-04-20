#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  Lidox — single-command local launcher
#
#  Usage:
#    ./run.sh          # start all services (infrastructure + apps)
#    ./run.sh stop     # stop Docker infrastructure
#    ./run.sh reset    # stop + remove Docker volumes (fresh database)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/.env"
ENV_EXAMPLE="$ROOT/.env.example"
PIDS=()

# ── helpers ────────────────────────────────────────────────────────
info()  { echo "  [lidox] $*"; }
warn()  { echo "  [lidox] ⚠  $*"; }
error() { echo "  [lidox] ✗  $*" >&2; exit 1; }

require() {
  command -v "$1" &>/dev/null || error "'$1' is required but not found. Please install it."
}

ensure_port_available() {
  local port="$1"
  local service_name="$2"
  local env_name="$3"
  local listeners

  listeners="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)"
  if [ -n "$listeners" ]; then
    error "${service_name} cannot start because port ${port} is already in use. Stop the existing process or set ${env_name} in .env to a free port."
  fi
}

# ── setup checks ───────────────────────────────────────────────────
require node
require npm
require docker
require python3.12

NODE_MAJOR=$(node -e 'process.stdout.write(process.version.slice(1).split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js ≥ 20 required (found $(node -v)). Use nvm or fnm to upgrade."
fi

if [ ! -f "$ENV_FILE" ]; then
  warn ".env not found — copying from .env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  warn "Edit $ENV_FILE and set at minimum JWT_SECRET and GROQ_API_KEY, then re-run."
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

FASTAPI_PORT="${FASTAPI_PORT:-${API_PORT:-3001}}"
SYNC_PORT="${SYNC_PORT:-3002}"
WEB_PORT="${WEB_PORT:-5173}"
VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://localhost:${FASTAPI_PORT}}"

ensure_fastapi_python_deps() {
  python3.12 - <<'PY' >/dev/null 2>&1
import bcrypt
import fastapi
import httpx
import jwt
import psycopg
import pydantic_settings
import redis
import uvicorn
PY
}

start_service() {
  local name="$1"
  shift
  info "Starting ${name}..."
  (
    "$@"
  ) &
  PIDS+=("$!")
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [ "${#PIDS[@]}" -gt 0 ]; then
    info "Stopping app services..."
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
    wait "${PIDS[@]}" 2>/dev/null || true
  fi

  exit "$exit_code"
}

wait_for_first_exit() {
  if [ "${BASH_VERSINFO[0]:-0}" -ge 4 ]; then
    wait -n "${PIDS[@]}"
    return $?
  fi

  while true; do
    for pid in "${PIDS[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        wait "$pid" 2>/dev/null || return $?
        return 0
      fi
    done
    sleep 1
  done
}

trap cleanup EXIT INT TERM

# ── subcommands ────────────────────────────────────────────────────
COMMAND="${1:-start}"

if [ "$COMMAND" = "stop" ]; then
  info "Stopping Docker infrastructure..."
  docker compose -f "$ROOT/docker-compose.yml" down
  info "Done."
  exit 0
fi

if [ "$COMMAND" = "reset" ]; then
  info "Stopping Docker infrastructure and removing volumes..."
  docker compose -f "$ROOT/docker-compose.yml" down -v
  info "Volumes removed. Run ./run.sh to start fresh."
  exit 0
fi

# ── start ──────────────────────────────────────────────────────────
info "Starting Lidox platform locally..."
echo ""

# 1. Start infrastructure
info "Starting PostgreSQL and Redis via Docker Compose..."
docker compose -f "$ROOT/docker-compose.yml" up -d --wait 2>/dev/null \
  || docker compose -f "$ROOT/docker-compose.yml" up -d

# Wait for Postgres
info "Waiting for PostgreSQL to be ready..."
until docker exec lidox-postgres pg_isready -U lidox -q 2>/dev/null; do
  sleep 1
done
info "PostgreSQL ready."

# 2. Install dependencies (fresh checkout only)
if [ ! -d "$ROOT/node_modules" ]; then
  info "Installing dependencies..."
  npm ci --prefix "$ROOT" 2>&1 | tail -3
fi

if ! ensure_fastapi_python_deps; then
  error "FastAPI Python dependencies are missing. Run: cd apps/api-fastapi && python3.12 -m pip install fastapi \"uvicorn[standard]\" pydantic-settings email-validator httpx PyJWT \"psycopg[binary]\" redis bcrypt pytest"
fi

ensure_port_available "$FASTAPI_PORT" "FastAPI API" "FASTAPI_PORT"
ensure_port_available "$SYNC_PORT" "Sync server" "SYNC_PORT"
ensure_port_available "$WEB_PORT" "Web UI" "WEB_PORT"

# 3. Launch FastAPI + sync server + web UI
echo ""
info "Starting all services:"
info "  → API          http://localhost:${FASTAPI_PORT}"
info "  → API docs     http://localhost:${FASTAPI_PORT}/api/docs"
info "  → Sync server  ws://localhost:${SYNC_PORT}"
info "  → Web UI       http://localhost:${WEB_PORT}"
echo ""
info "Press Ctrl+C to stop all services."
echo ""

start_service \
  "FastAPI API" \
  bash -lc "cd \"$ROOT/apps/api-fastapi\" && exec python3.12 -m uvicorn app.main:app --reload --host 0.0.0.0 --port \"$FASTAPI_PORT\""

start_service \
  "Sync server" \
  bash -lc "cd \"$ROOT\" && exec npm run dev:sync"

start_service \
  "Web UI" \
  bash -lc "cd \"$ROOT\" && export WEB_PORT=\"$WEB_PORT\" VITE_API_PROXY_TARGET=\"$VITE_API_PROXY_TARGET\" VITE_SYNC_PORT=\"$SYNC_PORT\" && exec npm run dev:web"

wait_for_first_exit
