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
