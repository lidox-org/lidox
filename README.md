# Lidox — Collaborative Document Editor

A real-time collaborative document editor with AI writing assistance, built as a proof-of-concept for the AI1220 course assignment. Think Google Docs meets AI co-pilot: multiple users edit simultaneously with live cursors, and an AI toolbar surfaces context-aware writing tools on text selection.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TipTap, Tailwind CSS, Zustand |
| Real-time sync | Hocuspocus + Yjs CRDT |
| Backend API | FastAPI, psycopg, PostgreSQL 16 |
| Auth | JWT (15 min) + rotating refresh tokens (7 days), HttpOnly cookies |
| AI pipeline | FastAPI async tasks + Redis event streams + Groq API |
| Infrastructure | Docker Compose (Postgres + Redis), Turborepo monorepo |

---

## Prerequisites

- **Node.js** 20+
- **Python** 3.12
- **Corepack** enabled so the repo uses **npm 11.6.2**
- **Docker** + Docker Compose

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd lidox
corepack enable
corepack npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
# Required for AI features
GROQ_API_KEY=gsk_...

# Required for auth security — change this in any non-local environment
JWT_SECRET=your-secret-min-32-chars

# Optional: enable Google OAuth on the login screen
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
WEB_BASE_URL=http://localhost:5173

# Everything else can stay as-is for local dev
```

Get a free Groq API key at [console.groq.com](https://console.groq.com). Without it, AI features return mock responses while the FastAPI async task flow and SSE wiring still run end to end.

### 3. Start all services

```bash
./run.sh
```

`./run.sh` starts PostgreSQL, Redis, the FastAPI backend, the sync server, and
the Vite web app. `npm run dev` is wired to the same launcher.

| Service | URL | Description |
|---|---|---|
| Web frontend | http://localhost:5173 | React app |
| API server | http://localhost:3001 | FastAPI REST + auth |
| API docs | http://localhost:3001/api/docs | FastAPI OpenAPI docs |
| Sync server | http://localhost:3002 | Hocuspocus WebSocket (CRDT) |

### Stopping

```bash
Ctrl+C              # stop app processes
npm run db:down   # stop Docker containers
```

### Testing

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm --workspace @lidox/sync-server run test
npm run test:e2e
```

FastAPI tests:

```bash
cd apps/api-fastapi
python3.12 -m pytest tests
```

Install the Playwright browser once before the first local e2e run:

```bash
npm run test:e2e:install
```

### Workflow

- PRs must start from a GitHub issue and use issue-linked branch names.
- Each PR must begin with a scope comment explaining what it addresses, what is out of scope, and how it was verified.
- See `CONTRIBUTING.md` for the workflow contract and `DEVIATIONS.md` for current known Assignment 2 gaps.

---

## Features

### Authentication

- Register and log in with email/password
- Optional Google OAuth login when Google client credentials are configured
- HttpOnly access-token cookie (15 min) + rotating refresh-token cookie (7 days)
- Refresh token reuse detection: replaying a used token revokes the entire token family
- Change password and update display name from Settings (`/settings`)

### Document Management

- Create, rename, and delete documents from the dashboard
- Documents auto-save title changes with 800ms debounce
- Role-based access: **owner**, **editor**, **commenter**, **viewer**

### Real-time Collaboration

- Concurrent editing via Yjs CRDT — no conflicts, no overwrite
- Live presence avatars in the editor header show who is online
- Colored cursors per collaborator (up to 8 distinct colors, cycling after)
- Connection status indicator (Cloud / CloudOff)
- Browser-local IndexedDB persistence keeps local edits available while offline and syncs them on reconnect

### Sharing

- Share documents via the Share button in the editor
- Assign roles (editor / commenter / viewer) to collaborators
- If an active collaborator is downgraded or revoked, their live editor session is forced back to the dashboard

### Version History

- Automatic snapshots stored on each meaningful save (debounced persistence from the sync server)
- Browse versions via the clock icon with stable visible numbering and preview text from the first logical lines
- **Restore:** restoring a snapshot replaces the live editor state for connected collaborators and becomes the newest stored version

### Export

- Export the current document as PDF from the editor header
- DOCX export remains future work and is tracked in `DEVIATIONS.md`

### AI Writing Tools

Select any text (3+ characters) in the editor — a floating toolbar appears above the selection with six AI actions:

| Action | Model | Description |
|---|---|---|
| Rewrite | llama-3.3-70b-versatile | Improve clarity and flow |
| Summarize | llama-3.3-70b-versatile | Condense to key points |
| Translate | llama-3.3-70b-versatile | Translate to a target language |
| Grammar Fix | llama-3.1-8b-instant | Correct grammar and punctuation |
| Analyze | llama-3.3-70b-versatile | Thematic and structural analysis |
| Explain | llama-3.1-8b-instant | Plain-language explanation |

After processing, a proposal panel slides up at the bottom of the editor with a diff view (additions in green, removals in red). You can **Accept**, **Reject**, or **Dismiss** the proposal.

AI tasks run asynchronously inside the FastAPI app and publish incremental
events through Redis-backed **Server-Sent Events**
(`GET .../ai/tasks/:taskId/stream`) after `invoke`, so proposal text updates
incrementally until completion. Each interaction is logged to the database with
token counts and estimated cost.

**Documentation:** See [`DEVIATIONS.md`](./DEVIATIONS.md) for explicit course-spec deltas, and [`docs/`](./docs/) for JWT/auth, collaboration transport, AI flow, demo script, and Q&A notes.

---

## Multi-user Testing

To test collaboration locally:

1. Open http://localhost:5173 in two browser profiles (or normal + incognito)
2. Register separate accounts in each
3. Create a document in the first account
4. Share it with the second account's email (set role to Editor)
5. Both users open the document — you will see live cursors and real-time edits

---

## Project Structure

```
lidox/
├── apps/
│   ├── api/            # Legacy NestJS backend kept as reference code
│   ├── api-fastapi/    # Active FastAPI backend used by the demo path
│   ├── sync-server/    # Hocuspocus CRDT sync server
│   └── web/            # React + Vite frontend
├── packages/
│   └── types/          # Shared TypeScript types and Zod schemas
├── .env.example
├── docker-compose.yml
└── turbo.json
```

The default demo path uses `apps/api-fastapi`. The older `apps/api` NestJS code
remains in the repo as legacy reference code while the FastAPI backend serves
the running web application.

---

## Feature Status

### Implemented

- [x] CRDT real-time collaboration (Yjs + Hocuspocus)
- [x] Live presence cursors and avatars
- [x] Local email/password auth with JWT + rotating refresh tokens
- [x] Google OAuth login flow when Google client credentials are configured
- [x] Token reuse detection + Redis deny set for revoked JTIs
- [x] Document CRUD with role-based access control
- [x] Version history with working restore for connected sessions
- [x] Sharing UI with role assignment
- [x] Forced mid-session disconnect on permission downgrade / revoke
- [x] AI pipeline: 6 task types, Groq API integration, Redis-backed SSE streaming
- [x] AI proposal diff UX: accept / reject / dismiss
- [x] Settings page: profile name update, password change
- [x] Mock fallback when `GROQ_API_KEY` is absent
- [x] SHA-256 source text hash for stale proposal detection
- [x] Token cost tracking per AI interaction
- [x] Browser-local offline persistence with sync-on-reconnect
- [x] PDF export from the editor header

### Future Direction

The following items are out of scope for the PoC but identified as the natural next step toward production readiness:

- **SSO**: GitHub OAuth and broader enterprise SSO providers
- **Document export**: DOCX download and richer tracked-change export parity
- **Accessibility**: WCAG 2.1 AA audit and remediation
- **Partial proposal acceptance**: Per-sentence checkbox toggles (current implementation accepts/rejects the full proposal)
- **Regenerate button**: Re-run an AI task on stale text from the proposal panel
- **Commenter role enforcement in AI toolbar**: Lock icon and disabled state for non-editors
- **AI kill switch**: Per-document toggle in document settings UI
- **AI audit tab**: AI interaction history inside the version history sidebar
- **Email notifications**: Share invitation emails
- **Automated tests**: Unit + integration + e2e suite
- **CI/CD**: GitHub Actions pipeline
- **Per-org budget circuit breaker**: Configurable token spend cap with UI indicator
