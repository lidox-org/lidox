# Assignment 2 Deviations

This file tracks known gaps between `docs/assignment2.pdf` and the current repository state. A deviation must stay here until the code, tests, and repository workflow all match the assignment claim.

## Open Deviations

| Area | Assignment expectation | Current repo state | Planned follow-up |
|---|---|---|---|
| Backend framework | FastAPI-based backend | The repo currently uses NestJS under `apps/api/` | Resolve in the backend strategy track before final sign-off |
| AI transport | Streaming AI with cancelation | Current mainline flow is queue + polling | Address in the AI lifecycle/transport track |
| Offline buffering | IndexedDB-backed offline edit buffering and reconnect reconciliation | No IndexedDB buffering is implemented on `main` | Address in the offline reconciliation track |
| Version restore | Real snapshot restore that updates active sessions | Current restore endpoint is placeholder-only | Address in the versioning track |
| Export | DOCX and PDF export | No export endpoints or UI | Address in the export track |
| SSO | Google and GitHub SSO | Env placeholders exist, implementation does not | Address in the auth-boundary track |

## Update Rule

- Add new deviations in the PR that discovers them.
- Remove a deviation only when the code, tests, and user-facing docs all match the assignment claim.
