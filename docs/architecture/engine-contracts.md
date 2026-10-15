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
