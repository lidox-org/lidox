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

# ── helpers ────────────────────────────────────────────────────────
info()  { echo "  [lidox] $*"; }
warn()  { echo "  [lidox] ⚠  $*"; }
error() { echo "  [lidox] ✗  $*" >&2; exit 1; }

require() {
  command -v "$1" &>/dev/null || error "'$1' is required but not found. Please install it."
}

# ── setup checks ───────────────────────────────────────────────────
require node
require npm
require docker

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

# 2. Install dependencies (if node_modules missing or package-lock changed)
if [ ! -d "$ROOT/node_modules" ] || [ "$ROOT/package-lock.json" -nt "$ROOT/node_modules/.install-stamp" ]; then
  info "Installing dependencies..."
  npm ci --prefix "$ROOT" 2>&1 | tail -3
  touch "$ROOT/node_modules/.install-stamp"
fi

# 3. Launch all apps via Turborepo
# Note: database migrations run automatically when the API boots (apps/api/src/db/migrate.ts)
echo ""
info "Starting all services:"
info "  → API          http://localhost:3001"
info "  → Sync server  ws://localhost:3002"
info "  → Web UI       http://localhost:5173"
echo ""
info "Press Ctrl+C to stop all services."
echo ""

npm run --prefix "$ROOT" dev
