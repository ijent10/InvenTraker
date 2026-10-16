# Operational engine contracts

## Common engine surface

Each engine exposes domain rules, application commands/queries, repositories, versioned API contracts, events, and widget definitions. Directory boundaries are introduced only when code moves; empty architecture folders are prohibited.

```ts
type EngineCommand<T> = {
  commandId: string
  organizationId: string
  locationId?: string
  actorId: string
  occurredAt?: string
  payload: T
}

type EngineResult<T> = {
  requestId: string
  schemaVersion: string
  committedAt: string
  data: T
  degraded?: boolean
}
```

Mutation handling requires authentication, organization isolation, location scope, permission check, validation, idempotency, transaction, audit, and event publication.

## Event envelope

```ts
type DomainEvent<T> = {
  eventId: string
  eventType: string
  schemaVersion: number
  sourceEngine: EngineId
  organizationId: string
  locationId?: string
  aggregateId: string
  actorAuditRef?: string
  occurredAt: string
  correlationId: string
  causationId?: string
  payload: T
}
```

Events use an outbox, retry metadata, and consumer receipts. Consumers are idempotent and tolerate duplicates/out-of-order delivery. AI output cannot be an authoritative mutation event.

## Engine registry

| ID | Owns | Initial compatibility source |
|---|---|---|
| `inventory` | balance, lot, movement, threshold, adjustment | stock action routes and batch allocation |
| `spot-check` | session, count, variance, reconciliation | spot-check route and iOS screen |
| `restock` | rule, recommendation, request, plan | restock route and recommendation service |
| `receiving` | shipment, session, discrepancy | receive route and iOS receiving |
| `discards` | discard, reason, approval, valuation | waste route/history |
| `transfers` | request, shipment, receipt, discrepancy | transfer route/history |
| `production` | recipe, batch, yield, portion | portion route and Cut & Portion UI |
| `orders` | supplier, purchase order, approval, delivery | ordering engine and order routes |
| `health-checks` | template, assignment, reading, corrective action | current health collections/pages |
| `assistant` | session, provider request, tool execution proposal | current AI modules and chat routes |
| `insights` | metric definition, observation, report, forecast | current intelligence modules |

## Stock ownership rule

Only Inventory posts movements. Receiving, Discards, Transfers, Production, and approved Spot Checks call Inventory application commands. Existing combined Firestore transactions remain intact until an equivalent orchestrator proves atomicity and idempotency.

## State transitions

- Spot Check: draft → in progress → submitted → review required → approved → reconciled, with cancel/reject.
- Transfer: requested → approved → picking → in transit → received → completed, with cancel/reject/discrepancy.
- Orders: draft → review/approval → submitted → partial/received/completed, with cancel rules.

Transitions are server-authorized. Clients render available transitions returned by the engine; they do not infer permissions from labels.

## Widget provider contract

```ts
type WidgetDefinition = {
  id: string
  engineId: EngineId
  title: string
  description: string
  supportedSizes: WidgetSize[]
  supportedShapes: WidgetShape[]
  permissions: string[]
  dataSource: string
  contentCapabilities: string[]
  availableActions: string[]
  defaultRefreshPolicy: RefreshPolicy
  fallbackRenderer: string
}
```

Provider queries accept an authorized principal, widget instance, size, active location, and freshness target. They return facts/candidates, never arbitrary component code.

## Versioning and compatibility

- New routes: `/api/v1/{engine}`.
- Existing `/api/mobile/v1` endpoints remain adapters during migration.
- Additive response changes do not require a major schema version.
- Removed/renamed fields require a parallel version and client migration telemetry.

## Test contract

Each engine needs domain invariant, API schema, authorization, invalid transition, integration, idempotency, audit, and event tests. Stock-consuming engines also test failure rollback and repeated command posting. Compatibility routes run against the same fixtures.

## Migration risk and rollback

The highest risk is duplicating stock or recommendation math. Wrap existing functions before relocating them. Keep one implementation and compare old/new response fixtures. Roll back routing with a feature flag; never reverse a ledger migration by deleting movements.


## First Inventory application boundary (implemented)

`src/lib/engines/contracts.ts` supplies the 11 engine identifiers, validated command/event/result/error envelopes and an application error type. `inventory/transfer.ts` owns the front/back transfer command, authorization checks, payload fingerprint, replay validation and movement plan. It reuses the existing stock quantity and earliest-expiring batch allocation functions. `firestore-transfer-repository.ts` supplies the transaction adapter; the application service has no Firebase dependency.

`POST /api/v1/inventory/transfers` accepts `{ commandId, locationId, payload: { itemId, quantity, source, destination, batchId? } }`. Organization and actor come exclusively from the authenticated principal. Success returns `{ requestId, schemaVersion: "1", committedAt, replayed, data }`; errors return `{ requestId: string | null, schemaVersion: "1", serverTime, error: { code, message } }`. `committedAt` is the successful transaction attempt's server processing timestamp, not a Firestore commit-time watermark. The mobile compatibility endpoint delegates to the same service and preserves its existing envelope and stock result.

Quantities use the existing three-decimal canonical precision. Transfers below 0.001 or with additional significant fractional digits are rejected instead of recording a zero/rounded movement. Transfers conserve stock and increment balance revision once. A new command fingerprint rejects reuse with a different item, quantity, direction or preferred batch. Older transfer records replay only when actor, store, ledger movement, result and timestamp verify the request; they are not backfilled with new events. Other stock commands retain their existing retry behavior pending extraction.

## Atomic event staging (implemented, dispatch pending)

All seven existing stock action types now call `postStockOperation` on their existing transaction. The helper creates the stock ledger entry and a deterministic `inventory.stock-committed.v1` event in the root `engineOutbox` collection. Inventory, batch, order-receipt linkage, operation history, ledger and event writes still commit or roll back together. Restock previews do not produce an event. Retries return the prior result without creating another event.

Outbox records contain a validated event, `status: pending`, `attempts: 0`, `nextAttemptAt`, and `createdAt`. Events carry tenant/store scope, unique affected item IDs, correlation/causation IDs, and an audit reference; they do not copy employee identities or operation result payloads. The root collection is denied to client SDKs under existing default-deny rules and is outside organization collection enumeration. No rules change is required.

**Not delivered:** a dispatcher, consumer receipts, retry execution, ordering guarantees, or event-driven workspace invalidation. Pending events are durable records, not proof of downstream delivery. No AI integration was added.

## Verification and rollback

- `engines:check`: movement conservation, source/store batch isolation, precision, input scope, permissions, replay/conflict behavior, old-ledger replay, event validation and shared JSON fixtures.
- `engines:swift`: compiles the active app's Foundation models and decodes both response versions from the same fixture. This is a DTO check using the macOS command-line SDK, not an iOS app build/device test.
- `engines:firestore`: opt-in integration against the pre-existing fake organization, using unique temporary records and cleanup. Requires Admin credentials and `INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1`; `INVENTRAKER_TEST_ORIGIN` selects the local or deployed API. Verifies all seven actions, receive-once behavior, compatibility parity, concurrent transfer contention, payload conflict, outbox-failure rollback and client denial of outbox reads. It never changes real-store inventory.

Rollback by redeploying the prior application revision; all previous collection/result fields are retained. New outbox records can remain pending. Never delete ledger entries to roll back application routing. Full migration of Receiving, Spot Check, Restock, Discards, Production and threshold changes to application/repository boundaries remains pending.


## Spot-check reconciliation command (implemented)

`inventory/spot-check.ts` owns the count/reconciliation application boundary. `POST /api/v1/inventory/spot-checks` accepts `{ commandId, locationId, payload: { lines: [{ itemId, expectedRevision, frontStock, backStock, reason?, expirationDate? }] } }`. The existing mobile endpoint delegates to the same service and retains `{ updated, historyId }` in its compatibility envelope, including existing inventory fields. The same result/error envelopes as Transfers apply. This is the reconciliation command, not a full Spot Check session/approval workflow.

The service checks actor/tenant/permission/store scope before repository access; verifies every item, revision and batch source; and plans all item changes before staging writes. One stale line rejects the entire count. Reconciliation reuses the original batch helper: lower counts consume dated quantities in the existing earliest-expiring order, while higher counts create an explicit unknown-expiration batch in the counted area. Invalid batch balances are rejected. Zero counts are valid; quantities retain the canonical three-decimal precision.

New count IDs are fingerprinted over a canonical item order, revisions, counts, reasons and expiration dates. Identical retries return the original response without another ledger/event write, including retries through the other API version. Reusing an ID with different details conflicts. Historical records replay only after matching their actor/store, affected items, before/after revisions, counts, reason and available expiration evidence. No event backfill occurs.

The request rejects more than 477 lines before loading records; the calculated transaction rejects more than 480 document writes, including inventory, batch reconciliation, history, ledger and outbox. Large saves must be split by the caller. The persisted count result is stored once; `engineResult` holds only envelope metadata to avoid duplicating large inventory payloads. Replays validate that metadata together with the saved result. Inventory timestamps use Firestore server timestamps; the response retains the engine's processing-time timestamp convention.

`check-spot-check-engine.mts` verifies scoped reconciliation, precision, malformed balances, revisions, retry conflicts, legacy replay, permissions, multi-line rejection, write limits and fixtures. The Swift fixture check decodes count inventory records through the active app's `InventoryItem` and shared envelope models. The opt-in Firestore suite now also tests count API parity, actual batch totals/unknown dates, competing counts, stale multi-line rejection and rollback of inventory/batches/history/ledger when event creation fails.

Remaining: count sessions, assignment/approval workflows, offline reconciliation, receipt sessions/discrepancies, and extraction of Restock, Discards, Production and threshold commands. Event dispatch and consumer receipts remain pending.


## Receiving command (implemented)

`inventory/receiving.ts` and `firestore-receiving-repository.ts` own receipt application/repository boundaries. `POST /api/v1/inventory/receipts` accepts `{ commandId, locationId, payload: { lines: [{ itemId, quantity, expirationDate?, orderId?, orderLineId?, receivedOrderQuantity? }] } }`. The mobile receive route delegates to the same service and preserves `{ receivedIds }` in its existing envelope. Receiving remains authorized by the existing `inventory.edit` permission and selected-store assignment. Order and item scope, order status, pack size, quantity, and line matching are verified before staging writes.

Inventory balances, separate backstock batches, receipt records, purchase-order progress, history, ledger and the pending event commit atomically. Only Submitted, Auto-submitted and Partially received orders accept receipts. Invalid order state/conversion/over-receipt returns a conflict instead of an unclassified server failure. Request quantities use canonical three-decimal stock precision; request lines are unique by item as before. The command caps input at 159 lines and calculated document writes at 480.

`applyStockOrderReceipt` in the shared Orders contract owns the stock/order-unit conversion. The old order-unit helper delegates to it, so pilot checks and production use the same calculation. Explicit order units must match received stock under the order line's pack size. New order-line `receivedStockQuantity` preserves canonical received stock, while `receivedQuantity` is derived by division without rounding every partial case to three order-unit decimals. Six separate single-unit receipts of a six-unit case close at exactly six stock units and one case. New receipt records retain inferred order units as well as explicitly supplied units. The primary ordering engine also rounds confirmed incoming stock to the existing three-decimal precision before calculating required stock, preventing a floating-point remainder from triggering a phantom reorder. Its version is now `2026-10-15.1`. Existing lines without the new field infer their prior stock-equivalent progress from the saved order-unit quantity; historical deliveries are not rewritten or guessed. Invalid/non-finite or inconsistent order balances are rejected.

Fingerprinting includes stock quantities, expiry, order links and explicit order quantities in stable item order. Both APIs replay the same saved result. Older ledger entries replay only after their original receipt records verify actor, store, operation, item, quantity, date and order linkage; no event backfill occurs. Order changes are never applied again during replay.

Validation includes the Receiving domain suite, shared order invariants and pilot cycle, Swift receiving request encoding/envelope decoding, and opt-in Firestore tests for both APIs, partial/completed receipts, mismatched units, over-receipt, competing receipts, distinct dated batches, retry safety and atomic order/stock/batch rollback on event failure. The test harness removes only its own temporary fake-organization records.

Remaining Receiving work: shipment/session and discrepancy workflows, supplier-document matching and its final web/native experience. This command migration does not complete those workflows. Event dispatch, consumer receipts and AI integration remain deferred.


## Restock command (implemented)

`inventory/restock.ts` owns floor-count reconciliation and the existing pull calculation: `min(max(0, floor target - counted floor), available backstock)`, using the existing target precedence (`frontCapacity`, `frontPar`, `par`) and three-decimal quantities. `POST /api/v1/inventory/restocks` accepts `{ commandId, locationId, payload: { commit, lines: [{ itemId, countedFrontStock, expectedRevision? }] } }`. Versioned commits require the revision returned by a current preview. Authentication, inventory-edit permission, actor/tenant/store scope and item scope are checked before mutation.

Previews are read-only, do not reserve/consume the operation ID, do not query batches, and return `generatedAt` with `{ committed: false, recommendations }`. They do not claim a commit timestamp. Commits use the normal engine result envelope, increment each balance revision once, and atomically save stock, batch reconciliation/movement, history, ledger and a pending event. The old mobile endpoint delegates to the same service and retains its envelope/result. Requests with the same command ID and counts/revisions replay the original saved result; changed details conflict. Historical ledger results verify actor/store and recorded floor counts, plus prior revisions where requested, without event backfill. Large mutations reject above 480 calculated document writes.

Floor counts can change total physical stock relative to the previous floor balance; the pull itself conserves the counted floor plus existing backstock. Batch reconciliation retains existing earliest-expiring allocation behavior. Newly found floor stock, untracked pulled stock and remaining untracked backstock receive explicit undated batches, with separate provenance labels. Dates are never invented. Backstock batches exceeding the aggregate balance, invalid batch quantities/areas and invalid targets fail before writes. New batch coverage avoids making untracked stock disappear once the item has some batch records.

The versioned endpoint rejects stale revisions. The compatibility endpoint accepts optional revisions to preserve older clients; requests without revisions retain the older concurrency limitation and must not be described as protected against stale observations. The active iOS source now captures preview revisions, invalidates recommendations on edited counts, disables edits during a request, and clears/reloads stale counts for an explicit recount. These source changes need an iOS build/install before existing phones gain that protection.

Validation: domain checks for targets, pull bounds, count variance, scoped batch order/coverage, invalid data, revisions, previews, permissions and replay; fixtures decoded with actual Swift Restock models and revision-bearing request encoding; Swift syntax parsing; real Firestore tests for both API versions, read-only previews, competing revision-aware commits, undated full batch coverage and stock/batch/history/ledger rollback on event failure. Full Xcode/iPhone validation remains pending because the active developer directory only provides Command Line Tools.

Remaining Restock work: request/plan lifecycle, assignments, final experience migration and native release validation. Discards, Production and threshold command extraction, event dispatch and consumer receipts remain pending; AI integration stays deferred.


## Discard command implementation

`POST /api/v1/inventory/discards` accepts `{ commandId, locationId, payload: { lines } }`; each line contains `itemId`, canonical stock `quantity`, `area`, `reason`, and optional preferred `batchId`. The compatible mobile waste route delegates to the same Inventory application service and Firestore repository. Authenticated organization/actor, current permission, store assignment, quantities and one-line-per-item/area constraints are validated before writes.

A discard decreases stock in each selected area and advances each affected item once. Earliest-expiring allocation and the existing preferred-batch-first override are retained; a preferred batch may be followed by other batches if needed. Invalid batch balances and batches exceeding the affected area's recorded balance reject the command. Remaining stock without batch provenance is represented by an explicitly undated batch in each affected area; no expiry is invented. Discard records retain unallocated quantities, allocations, reasons and override provenance.

The command atomically saves stock, batches, waste entries, history, ledger and staged event. Payload-aware replay rejects changed reasons, quantities or batch selection; historical retries verify the original waste entries before replaying. A calculated write budget rejects oversized batch changes. Metadata stores only the result envelope header. The event dispatcher remains disabled; waste review/approval, undo/compensation workflows, Production and threshold extraction remain pending. This is the Inventory command boundary for Discards, not a completed standalone Discards engine.
