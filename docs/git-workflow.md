# Git branching and CI (actual practice)

## Observed automation

- **CI** (`.github/workflows/ci.yaml`) runs on **pull requests** to **`main`**: `npm ci` → lint → typecheck → test → build.
- There is no enforced branch naming convention in YAML; teams often use `feature/...` or `fix/...` by convention.

## Recommended team practice (document to match reality)

1. Branch from **`main`** for work items.
2. Open a **PR** early; keep changes **review-sized**.
3. Ensure **green CI** before merge.
4. **Merge to `main`** after review (squash vs merge commit is team preference—pick one and stay consistent).
5. When behavior changes, update **`DEVIATIONS.md`** or feature docs in the same PR.

## Alignment with evaluator feedback

Course feedback called out **branch/merge conventions** that were documented but not followed. This file is accurate only if the team actually uses PRs to `main` and keeps CI green; update if your workflow differs.
