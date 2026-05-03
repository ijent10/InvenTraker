# Firestore Migration Registry

`registry.json` tracks idempotent migrations that have been applied via `npm run migrate`.

Each migration script must:
1. Be safe to run multiple times.
2. Log counts for reads, writes, and skipped documents.
3. Avoid destructive deletes unless explicitly requested.

Applied versions are stored as entries in `registry.json.applied`.
