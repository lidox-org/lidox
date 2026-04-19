# Live demo script (~5 minutes)

Run services first: `docker compose up -d`, then `npm run dev`. Use **two browser profiles** (or normal + private) for collaboration.

**Grading order — narrative you can follow verbatim.**

---

### 1. Register and login (~45s)

- Open `http://localhost:5173`, **Register** a user (email + password + name).
- Confirm you land on the **Dashboard**. Mention JWT access in memory + refresh cookie (see `docs/jwt-and-auth.md`) if asked.

### 2. Create a document (~20s)

- **New document**, give it a clear title; open it from the dashboard.

### 3. Rich-text edit + save indication (~30s)

- Type a short paragraph. Point out **auto-save** / connection status (cloud indicator) if visible.

### 4. Share + roles (~60s)

- Open **Share**, invite the **second account’s email** with **Editor** (register the second user in the other profile first).
- In the second profile, accept access and open the **same** document from the dashboard.

### 5. Real-time collaboration (~60s)

- Type in one window; show live updates in the other. Point at **cursors / presence** if shown.

### 6. AI: stream + cancel + review (~90s)

- Select a sentence (3+ chars). Open the **AI toolbar**, run **Rewrite** or **Summarize**.
- Show **streaming** text in the proposal panel; optionally **Cancel** mid-flight then retry.
- **Accept** or **Reject** the proposal. Mention SSE (`docs/ai-request-flow.md`), not polling.

### 7. Version history (~45s)

- Open **Version history** (clock). List past snapshots if any.
- **Important:** If asked to “restore,” state honestly per `DEVIATIONS.md`: restore is **not** fully wired to reload editor state—do not claim full restore unless fixed before grading.

### 8. Close (~15s)

- Summarize stack: React + Yjs/Hocuspocus + NestJS + Postgres + Redis; AI via Groq behind queue + SSE.

---

**Backup plan:** If the network or Groq fails, show **mock** behavior with `GROQ_API_KEY` unset (README) and still walk through invoke → SSE → review.
