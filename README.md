# Lidox — Collaborative Document Editor

A real-time collaborative document editor with AI writing assistance, built as a proof-of-concept for the AI1220 course assignment. Think Google Docs meets AI co-pilot: multiple users edit simultaneously with live cursors, and an AI toolbar surfaces context-aware writing tools on text selection.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TipTap, Tailwind CSS, Zustand |
| Real-time sync | Hocuspocus + Yjs CRDT |
| Backend API | NestJS, Drizzle ORM, PostgreSQL 16 |
| Auth | JWT (15 min) + rotating refresh tokens (7 days), HttpOnly cookies |
| AI pipeline | BullMQ job queue → Groq SDK (llama-3.3-70b / llama-3.1-8b-instant) |
| Infrastructure | Docker Compose (Postgres + Redis), Turborepo monorepo |

---

## Prerequisites

- **Node.js** 20+
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

# Everything else can stay as-is for local dev
```

Get a free Groq API key at [console.groq.com](https://console.groq.com). Without it, AI features return mock responses (the queue pipeline still runs, just with placeholder text).

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL 16 and Redis 7 via Docker Compose. Database tables are created automatically when the API boots for the first time.

### 4. Start all services

```bash
npm run dev
```

Turborepo starts all three services in parallel:

| Service | URL | Description |
|---|---|---|
| Web frontend | http://localhost:5173 | React app |
| API server | http://localhost:3001 | NestJS REST + auth |
| Sync server | http://localhost:3002 | Hocuspocus WebSocket (CRDT) |

### Stopping

```bash
npm run db:down   # stop Docker containers
```

### Testing

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
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
- JWT access tokens (15 min) + rotating refresh tokens (7 days, HttpOnly cookie)
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

### Sharing

- Share documents via the Share button in the editor
- Assign roles (editor / commenter / viewer) to collaborators

### Version History

- Automatic snapshots stored on each meaningful save (debounced persistence from the sync server)
- Browse versions via the clock icon in the editor header
- **Restore:** the API acknowledges restore; reloading Yjs content from a chosen snapshot into the live editor is **not fully wired**—see [`DEVIATIONS.md`](./DEVIATIONS.md)

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

AI jobs run asynchronously through a BullMQ queue with up to 5 concurrent workers. The frontend receives results via **Server-Sent Events** (`GET .../ai/tasks/:taskId/stream`) after `invoke`, so proposal text can update incrementally until completion. Each interaction is logged to the database with token counts and estimated cost.

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
│   ├── api/            # NestJS backend (auth, documents, AI, WebSocket auth)
│   ├── api-fastapi/    # FastAPI migration scaffold for Assignment 2 cutover
│   ├── sync-server/    # Hocuspocus CRDT sync server
│   └── web/            # React + Vite frontend
├── packages/
│   └── types/          # Shared TypeScript types and Zod schemas
├── .env.example
├── docker-compose.yml
└── turbo.json
```

The active backend remains `apps/api` for now. `apps/api-fastapi` is a parallel
migration target being ported incrementally so the team can move to FastAPI
without breaking the working demo path in one rewrite.

---

## Feature Status

### Implemented

- [x] CRDT real-time collaboration (Yjs + Hocuspocus)
- [x] Live presence cursors and avatars
- [x] Local email/password auth with JWT + rotating refresh tokens
- [x] Token reuse detection + Redis deny set for revoked JTIs
- [x] Document CRUD with role-based access control
- [x] Version history (list + snapshots); restore **partially implemented** (see `DEVIATIONS.md`)
- [x] Sharing UI with role assignment
- [x] AI pipeline: 6 task types, Groq SDK, BullMQ queue, model routing
- [x] AI proposal diff UX: accept / reject / dismiss
- [x] Settings page: profile name update, password change
- [x] Mock fallback when `GROQ_API_KEY` is absent
- [x] SHA-256 source text hash for stale proposal detection
- [x] Token cost tracking per AI interaction

### Future Direction

The following items are out of scope for the PoC but identified as the natural next step toward production readiness:

- **SSO**: Google / GitHub OAuth (env stubs present in `.env.example`, not wired)
- **Offline support**: IndexedDB buffer with sync-on-reconnect and "Working offline" banner
- **Document export**: PDF / DOCX download
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
