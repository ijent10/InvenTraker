# InvenTraker target-state architecture

## Direction

Use a modular monolith around the existing Next.js/Firebase deployment. Preserve the proven transactional stock layer, then expose explicit engine commands, queries, events, and widget providers. Do not split into network microservices without a measured deployment or scaling need.

## Layers

1. **Experience layer:** public website, authenticated web portal, SwiftUI app.
2. **Workspace layer:** user layout, widget registry, renderer, edit mode, device layouts, candidate selection.
3. **Engine application layer:** commands, queries, authorization policies, state machines.
4. **Engine domain layer:** entities, invariants, value objects, domain events.
5. **Infrastructure layer:** Firestore repositories, Firebase Auth, Storage, notifications, jobs, external providers.
6. **Intelligence layer:** deterministic candidates and ranking, optional AI reranking/summarization, assistant provider adapters.

## Engine ownership

| Engine | Existing source to preserve | Target ownership |
|---|---|---|
| Inventory | inventory records, batches, stock operations | products, balances, lots, movements, adjustments |
| Spot Check | mobile spot-check transaction and history | sessions, counts, variances, approval/reconciliation |
| Restock | restock action and recommendation logic | rules, requests, plans, priority |
| Receiving | receiving transaction and order linkage | shipments, sessions, discrepancies, confirmation |
| Discards | waste transaction and reason data | discard records, approvals, valuation |
| Transfer | transfer transaction and batch movement | request-to-receipt state machine |
| Cut & Portion | portion endpoint and SwiftUI cut flow | recipes, batches, inputs, outputs, yields, portions |
| Orders | order engine, drafts, transitions | suppliers, purchase orders, approvals, expected delivery |
| Health Checks | templates, assignments, responses | sessions, readings, compliance rules, corrective actions |
| Assistant | context, tools, provider files, chats | provider-neutral sessions, authorized tools, structured results |
| Insights | operational intelligence modules | versioned metrics, trends, reports, forecasts, anomalies |

Inventory remains the only owner allowed to post authoritative stock movements. Other engines request movements through Inventory commands within a transaction boundary or an orchestrated application service.

## API convention

- Version under `/api/v1/{engine}` while retaining `/api/mobile/v1` compatibility adapters.
- Validate all input and output contracts.
- Require authenticated principal, organization, store/location scope, permissions, and idempotency key for mutations.
- Return `requestId`, schema version, server timestamp, and explicit degraded state where relevant.
- Use cursor pagination for large lists.
- Never use a successful HTTP response to hide a partial transaction failure.

## Persistence and events

Retain organization-scoped Firestore collections during migration. Introduce repository interfaces per engine and an additive event outbox. Commit the domain change, audit entry, idempotency record, and outbox item atomically when Firestore limits permit. Consumers maintain idempotency receipts and retry metadata. Events are projections and integration signals; they never replace the movement ledger.

## Cross-platform contracts

Maintain canonical JSON Schema or Zod contracts in the web/backend repository. Generate or validate Swift DTO fixtures in CI. Use fixtures for request/response parity before routing iOS from compatibility endpoints to `/api/v1`.

## Security boundaries

Every query receives a principal containing user, organization, permitted stores, role, and permission set. Widget and AI requests use the same principal. AI context builders receive already-authorized, minimized records and cannot broaden scope. Write tools return a proposed command and require explicit confirmation where impact warrants it.

## Migration strategy

1. Add IDS tokens and primitives without changing business logic.
2. Refine shells behind existing routes.
3. Add contracts and compatibility adapters.
4. Wrap existing inventory transactions as the reference engine.
5. Add Workspace Engine alongside the current ordered dashboard; migrate preferences additively.
6. Move one remaining engine at a time and verify stock invariants after each.
7. Add AI ranking after deterministic candidates work without AI.

## Risks, tests, rollback

- **Risk:** contract mismatch. **Test:** shared fixtures and API contract tests. **Rollback:** keep mobile compatibility endpoints.
- **Risk:** stock double-post. **Test:** repeated idempotency calls and cross-engine transaction tests. **Rollback:** disable new command path and retain ledger.
- **Risk:** preference loss. **Test:** migrate ordered IDs into versioned layouts without deleting old field. **Rollback:** renderer falls back to `dashboardWidgetIds`.
- **Risk:** UI regression. **Test:** responsive, keyboard, VoiceOver/screen reader, reduced motion, high contrast. **Rollback:** feature flags for shell and workspace runtime.
