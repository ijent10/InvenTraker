# Phase 6 — Operational sessions

Status: first Spot Check / Receiving workflow slice implemented. This is not closure of Phase 6. Phase 5 simulator gesture and accessibility checks remain pending because the Mac was locked; AI integrations remain deferred.

## Delivered workflow

`/spot-checks` and `/receiving` provide organization/store scoped task lists, draft creation/editing, employee assignment, submission, manager approval, return with a correction note, cancellation, and saved status. Inventory and sidebar links open these screens. Optional Count tasks and Delivery tasks Home widgets show open work, separately from the existing recorded-stock widgets. New widgets do not alter saved layouts.

A count captures each item's stock revision. Saving, submitting and approving reject stale counts; after reloading stock, the web editor offers a recount that clears the old quantities. Unsaved changes disable submission. Quantities use the item's stock unit and the existing three-decimal stock contract. Receiving supports a supplier/delivery reference and notes. Existing order links and expiration fields supplied through the API survive web edits.

## API and persistence

`GET /api/v1/operations/sessions?storeId=...` returns permitted stores, valid inventory, eligible employee choices and tasks. `POST` accepts a strict discriminated action contract in `src/lib/engines/operations/sessions.ts`:

- `create`: UUID ID, storeId and typed count/receiving content; starts at revision 0.
- `save`: ID, expectedRevision and full content; draft only.
- `submit`: saved draft to submitted, without changing stock.
- `return`: manager-only submitted to draft; requires reviewNote.
- `cancel`: draft, or manager cancellation of submitted work.
- `post`: manager-only submitted to posted, with stock changes.

Persisted records live at `orgs/{orgId}/operationSessions/{uuid}`; immutable action audit entries live under `events/{revision}`. Organization, store and kind cannot be changed. Managers may assign active employees who can edit inventory and have store access. Employees may access only tasks they created or are assigned, and cannot assign other employees or approve work. Current API membership/permission/store checks are required on every call. Client Firestore access is denied; the default deny also protects these collections on installations with the previous rules.

Approval uses the existing Spot Check / Receiving application services with the same Firestore transaction as the session and audit entry. Existing stock arithmetic, revision validation, batch/order reconciliation, immutable ledger, history and stock-committed outbox event remain authoritative. The session UUID is its stock command ID. Retrying approval returns the posted session; concurrent approvals cannot double-apply stock. Any failure rolls back session status together with all stock writes. The existing `INVENTORY_WRITES_ENABLED=false` pause also blocks approval. Drafts and review can continue during a stock pause.

Task APIs currently cap a task at 40 items. Directories are bounded to 200 stores/items/employees and 100 returned tasks, with explicit partial labels. Queries do not scan entire organizations. Nonmanager task lists and widget queries constrain createdBy/assignedTo before returning data. Widgets project only ID, kind, store and status, excluding notes, quantities, employee identity and supplier references. Draft transitions have private audit entries; only stock posting emits the existing durable inventory event. Task widgets use the existing refresh fallback for draft changes.

## Validation

- Session state/schema checks: access, assignment, revision conflicts, manager-only review, mandatory return note, immutable terminal states, duplicate lines.
- Real Firebase HTTP integration in a temporary organization: Auth, assignment visibility, no draft stock writes, review/return, concurrent count/receipt approval once, outbox failure atomic rollback, stock/batch/ledger consistency, private widget summaries, transfer invalidating a pending count, inactive and wrong-org/store denial. Temporary accounts and records are deleted in finally.
- Existing engine and provider regressions, TypeScript, lint and production build.
- Browser visual/accessibility interaction remains unverified while the Mac is locked. No native session UI parity is claimed; the existing native immediate stock actions remain compatible.

Commands: `operations:check`, opt-in `operations:integration`, `engines:check`, `workspace:providers`, `typecheck`, `lint`, `build`.

## Remaining before engine/phase closure

Spot Check still needs offline reconciliation and production-scale paging/filtering. Receiving still needs expected-versus-received shipment discrepancies and supplier document matching; supplier references alone do not perform matching. Session-native screens, browser/simulator accessibility checks and lifecycle event consumers remain follow-up work. The rest of Phase 6 (Restock/Orders, Discards/interstore Transfers, production recipes/yields, Health Checks, Insights) is unchanged and pending.

## Rollback

Revert the session routes/pages, navigation and optional widget catalog/provider additions to the previous release (`4295bfe`). Existing sessions remain stored and private; legacy direct stock commands are unchanged. Never delete ledger/outbox history to roll back a UI. Use the existing inventory-write pause if stock writes need to stop.
