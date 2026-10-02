# Inventraker implementation roadmap

Prepared September 30, 2026, from the supplied product vision and the [local project assessment](</Users/ian/Desktop/Projects/InvenTraker Website/docs/vision-assessment-2026-09-30.md>).

**First release objective:** a manager and associates can count stock, record waste, see expiring batches, prepare an explainable vendor order, receive a partial delivery, and understand every resulting inventory change across web and iPhone.

This is a proposed implementation sequence, not a claim that these changes have been made. Phases are dependency and acceptance gates, not calendar promises. Staffing, production migration requirements and live data quality have not been established.

## Phase 0 — Make the existing platform safe to trust

**Outcome:** every displayed fact belongs to the signed-in person's authorized workspace, and unavailable data is visibly unavailable.

Work:

- Introduce one server authentication and authorization layer used by web pages, search, assistant/intelligence routes and mobile APIs. Derive organization from verified membership; authorize an explicitly selected store and department.
- Close omitted-store and missing-store-record access cases. Use a separate explicitly authorized organization-wide mode for users who need it. Scope notifications and document retrieval too.
- Align Firestore rules with capabilities, suspension, store/department scope, and protected order transitions. Protect actor identity and audit metadata from client modification.
- Make demo mode explicit and isolated. Remove production fallback to fixture stock; report read failures and freshness. Replace static web insights and assistant waste inputs with scoped live sources or clear unavailable states.
- Correct hardcoded store/actor attribution. Inventory changes must use the selected authorized store and verified actor.
- Audit visible controls: connect each action to a real operation or label/disable it honestly. Start with vendor creation, health-check completion and insights refresh.
- Establish local/emulator checks for authorization and operational invariants. Keep fixtures outside production domain types.

Exit gate: unauthenticated, suspended, cross-organization, unauthorized-store, unauthorized-department, and draft-only approver cases are denied at the server/rules boundary. A database outage never displays demo stock as real. A user without approval rights cannot submit by direct document write. No operational success message appears for a generic form snapshot.

**Implementation status (audited 2026-10-01): partial.** Mobile operational routes verify Firebase tokens, membership, suspension, permissions, and required store scope; direct client writes to protected stock, batch, order, and issue records are denied; and live server reads no longer fall back to fixtures unless explicit demo mode is enabled. The exit gate is not complete across the whole product: several legacy web pages and search/intelligence/import routes still use a default organization or accept an organization identifier without the shared request authorization layer, department scope is not consistently enforced, and authorization emulator coverage is still missing. These paths must be closed before production trust or the later phase exit gates can be declared complete.

## Phase 1 — Unify stock operations and audit history

**Depends on:** Phase 0 access contract.

**Outcome:** web and iPhone perform the same operation and produce the same auditable result.

Work:

- Extract the existing transactional mobile actions into shared server services. Route web count, adjustment, receipt, waste, restock and transfer through those services.
- Define stable organization product and store-stock IDs; use references rather than name matching as the primary join.
- Add operation IDs for retry deduplication, stock revisions for stale-count detection, and duplicate-line validation or aggregation.
- Store operation type, before/after/delta, unit, actor, timestamp, store/department, reason and source references atomically with stock updates.
- Keep events append-only; reverse or correct with a new linked event. Treat editable activity-feed text separately from the audit record.
- Record par changes with old/new values and a reason. Distinguish observed counts from estimated quantities and imported data.
- Standardize derived status and unit conversions. Define decimal precision and case-to-stock conversions; keep currency as structured amounts rather than formatted strings.
- Define a mobile connectivity contract: explicit unsent state, persisted operation ID and safe retry. Defer full offline operation if necessary, but never silently claim an unsaved action succeeded.

Exit gate: a count of 10 followed by a receipt of 5 and waste of 2 yields 13 on both clients with linked evidence. Retrying either operation changes nothing. Two receipt lines for the same item are aggregated correctly or rejected. A stale count is flagged instead of overwriting intervening receipts. Floor/backstock transfers preserve total stock.

**Implementation status (audited 2026-10-01): implemented behind the incomplete Phase 0 gate.** Count, receipt, waste, restock, transfer, and par-change endpoints use retry-safe operation IDs, transactions, revisions, duplicate-line rejection, verified actor attribution, immutable stock events, and shared web/mobile endpoints. The deterministic stock suite covers arithmetic, retries, duplicate lines, stale counts, and total-preserving transfers. Production acceptance remains blocked by the Phase 0 cross-product authorization gaps above and by a real signed-device workflow run.

## Phase 2 — Restore batch expiration as a core capability

**Depends on:** Phase 1 stock events and unit definitions.

**Outcome:** “18 units” can be explained as quantities with different usable dates.

Work:

- Port the older batch model's domain behavior into the server contract, including quantity, received date, expiration, stock area, split and parent references. Do not reintroduce a second independent client inventory engine.
- Create batches during receiving. Allocate waste, usage, counts and transfers to batches; support earliest-expiring-first defaults with recorded human overrides.
- Represent unknown expiry explicitly. Add opened/prepared dates and shelf-life rules only for products that require them.
- Show total, usable, expired and expiring-before-delivery quantities. Keep policy for expired-stock availability explicit and consistent.
- Add batch views to product detail and a practical mobile “use first” list.
- Migrate existing snapshots as opening balances with unknown batch detail when history cannot establish it. Never invent historical expiration dates.

Exit gate: receiving 6 units expiring tomorrow and 12 next week preserves both quantities. Wasting 2 from the first batch leaves 4 and 12. Counts reconcile batch sums to stock totals, and unknown dates remain visible.

**Implementation status (audited 2026-10-01): implemented behind the incomplete Phase 0 gate.** Receiving creates dated or explicitly unknown batches; discards, restocks, counts, and area transfers reconcile or split those batches using earliest-expiring-first allocation. Waste and transfer workflows support recorded batch overrides. Web and iOS show physical, usable dated, expired, unknown, delivery-risk, and use-first quantities. Existing balances have a dry-run migration with a required pre-write backup and quarantine records for ambiguous data. The automated stock invariant check covers the Phase 2 arithmetic contract; production migration and signed-device acceptance have not yet run.

## Phase 3 — Complete ordering and receiving as one lifecycle

**Depends on:** stock accuracy from Phase 1 and usable-stock accounting from Phase 2.

**Outcome:** every order quantity has an explanation, every approval has an actor, and every receipt reconciles to what was ordered.

Work:

- Replace browser recommendation math with one versioned server recommendation service. Web/iOS request and display it. Preserve the older project's single-engine principle and reinstate a boundary check suited to this repository.
- Define vendor-product associations, ordering units, case packs, minimum quantities, structured cutoffs and delivery calendars.
- Calculate replenishment over a defined delivery/coverage window. Separate projected demand, usable on-hand, confirmed incoming stock and target ending stock. Exclude unapproved drafts from confirmed incoming quantities.
- Avoid double-counting expiry: either subtract unusable units from available stock or add an expiration adjustment once. Cap or flag unsupported forecasts and insufficient history.
- Return original inputs, data freshness, source references, run ID, timestamp, engine/schema version, rule path, degraded flags and calculation details.
- Preserve suggested quantity, final quantity and override reason separately. Show vendor-minimum gaps as decisions for a manager; do not quietly inflate orders.
- Implement valid state transitions: draft → approved → sent/recorded as ordered → partially received → received → reconciled/closed, with cancellation and exceptions. Record how an order was sent; do not imply supplier transmission where none exists.
- Link receipt lines to order lines, handle shortages/substitutions/damage, and update incoming balances and vendor history. Recalculate totals on the server from validated quantities and costs.

Exit gate: sufficient usable stock and incoming stock can yield a zero recommendation. A case conversion is explicit. A manager can explain and override a recommendation. Receiving 10 of 12 units leaves 2 outstanding without adding 12 to inventory. Approval cannot be bypassed; retrying a receipt does not duplicate it.

**Implementation status (audited 2026-10-01): implemented behind the incomplete Phase 0 gate.** Web and iOS use the same versioned server recommendation endpoint. Recommendations separate physical, usable, expiring, unknown, confirmed incoming, projected demand, and target ending stock; return calculation evidence, source references, freshness, versions, rule path, and degraded flags; and preserve suggested quantities separately from manager overrides. Vendor rules support order units, pack sizes, line minimums, increments, costs, cutoffs, lead times, and delivery weekdays. Orders follow server-controlled draft, approval, recorded submission, partial receipt, received, reconciliation, and cancellation transitions. Linked receipts update inventory, batches, outstanding order quantities, and history atomically with retry protection. The order invariant suite covers the deterministic Phase 3 exit cases; live vendor and signed-device acceptance remain outstanding.

## Phase 4 — Deliver the “Today” experience and the first pilot

**Depends on:** trustworthy stock, batches, orders and events.

**Outcome:** opening Inventraker tells a person what needs action and why.

Work:

- Define operational issues for stockout risk, imminent expiry, overdue counts, count variances and order cutoffs.
- Give each issue an evidence set, severity, deadline, scope, suggested action and status. Deduplicate repeated signals and resolve issues when the underlying condition changes.
- Account for confirmed incoming deliveries when deciding whether low stock actually needs action. Rank by operational urgency and impact, rather than fixed confidence values alone.
- Show a few highest-priority actions first; provide drilldowns to the product, batch, count, order or discrepancy.
- Complete scheduled checklist answers and flagged-response handling as a separate workflow from calculated inventory health.
- Show freshness/unknowns. If a health rollup is introduced, expose its rules and reasons; begin with named states rather than an unexplained percentage.

Pilot gate: run one department through a full count → waste → order → partial receipt → reconciliation cycle on web and iPhone, including a connection interruption and a discrepancy. Every attention card leads to an actionable record and clears when resolved. Monitor balance mismatches, duplicate operations, unresolved variances and manager overrides throughout the pilot.

**Implementation status (audited 2026-10-01): feature implementation complete; live pilot pending.** Web and iOS open on a ranked Today issue stream generated from inventory, batches, submitted incoming stock, order cutoffs, counts, and stock operations. Every issue has a stable ID, evidence, source references, severity, deadline, scope, suggested action, destination, freshness, and open/resolved lifecycle. Submitted incoming stock suppresses resolved shortage risks; assigned health checks remain separate. The pilot monitor exposes balance mismatches, duplicate operation IDs, unresolved count variances, and manager overrides. The automated pilot suite runs the full lifecycle, retry, and discrepancy scenario, but it is simulation evidence rather than the required department pilot on deployed web and a signed iPhone build.

## Phase 5 — Add grounded analysis and shared ComplicatedAI integration

**Depends on:** sufficient accurate operational history and the pilot gates above. The existing assistant can remain narrowly scoped earlier once Phase 0 removes mixed/demo facts and closes access gaps.

**Outcome:** answers explain verified business records and distinguish evidence from inference.

Work:

- Specify an Inventraker product adapter for the shared ComplicatedAI architecture once that service's actual interfaces are available. Reuse the existing resolver, structured answers and document retrieval where suitable.
- Expose deterministic tools for current balance, batch expiry, stock events, order explanations, cost changes and comparable-period waste. Pass only authorized, privacy-filtered records.
- Attach timestamps and source links to factual answers. Say when usage data is missing; a falling count alone is not proof of sales, waste or theft.
- Preserve the current separation between human audit identity and assistant context. Keep actions draft-only until an explicit approved workflow exists.
- Add demand baselines only after usage data quality is established. Compare them with simple historical baselines using held-out periods, and retain a deterministic fallback.
- Evaluate factual correctness, source support, scope isolation, privacy, missing-data behavior and recommendation impact. Fixed confidence numbers must not masquerade as validated probabilities.

Exit gate: an answer to “Why did this run out?” cites the relevant counts, usage evidence, par changes and delivery shortages, or explicitly reports insufficient evidence. It never fabricates a cause from demo history. Assistant actions cannot bypass the same permissions and approval rules as ordinary UI actions.

**Implementation status (2026-10-01): foundation complete; shared AI connection deferred.** Inventraker now exposes authenticated, organization- and store-scoped deterministic tools for balances, batch expiry, stock events, order explanations, cost changes, comparable waste, and runout explanations. Results carry timestamps, source links, freshness states, missing-data statements, and explicit inference limits. A recursive privacy boundary removes audit identities before assistant use while preserving product facts. The product adapter is versioned, mutation-free, and draft-only; it cannot bypass UI permissions or approval workflows. Demand baselines require verified usage history and are selected against a held-out period, with a deterministic no-adjustment fallback. The external ComplicatedAI service connection remains intentionally unimplemented until its interface is available.

## First implementation backlog

| Priority | Deliverable | Primary starting points | Acceptance evidence |
|---|---|---|---|
| P0 | Shared request authorization and scoped reads | `mobile-api.ts`, `server-data.ts`, web layout/pages, search and assistant APIs | Isolation and suspension tests across two organizations and stores |
| P0 | Protected order approval and immutable actor fields | Firestore rules, order writes/submission | Draft creator cannot approve, spoof approver, or rewrite submitted lines |
| P0 | Explicit live/demo/unavailable states | Server data, assistant context, Insights | Failed read produces unavailable state; no fixture facts in live mode |
| P0 | Correct selected store and actor attribution | Inventory form and draft builder | Two-store saves go only to the selected authorized store |
| P1 | Atomic, retry-safe inventory operations | Existing mobile action routes, web inventory writes | Retry, duplicate-line and concurrency cases preserve balances |
| P1 | Durable stock and par events | History collection and mutation services | Every change has old/new values, actor, reason and source |
| P1 | Batch quantities and expiration views | Older `Batch.swift`, new receiving and inventory models | Batch reconciliation and earliest-expiring allocations |
| P1 | Server order preview with calculation trace | Draft builder, recommendations, restock service | Zero-order, conversion, incoming-stock and expiry fixtures |
| P1 | Order-linked partial receiving | Orders, receipt routes, mobile receiving | Ordered/received/outstanding quantities reconcile |
| P2 | Prioritized operational issues and Today UI | Dashboard, mobile insights, health screens | Evidence-backed issues resolve after corrective action |

Work should proceed in dependency order. Access and data-source fixes can be grouped; batch accounting should not precede the agreed operation/event contract. These are work packages, not individual small tickets.

## Proposed minimum data contracts

Retain the catalog → organization product → store product/stock distinction. Extend it with the following server-owned contracts:

| Record | Required meaning |
|---|---|
| Stock snapshot | Scoped product reference, quantities in canonical units, revision, last verified count and freshness |
| Stock event | Immutable operation ID/type, scoped references, before/after/delta, actor, reason, timestamp, related records |
| Batch | Remaining quantity, unit, received/opened/expiry dates where known, stock area, parent/source receipt |
| Par change | Old/new target and threshold, effective time, reason and authorized actor |
| Recommendation run | Frozen inputs and evidence, engine/schema versions, calculation, output, freshness and degraded state |
| Order and receipt | Stable line references, suggested/final quantities, approval/sending states, received/outstanding quantities |
| Operational issue | Rule/version, evidence, scope, urgency, deadline, action destination, resolution state |

Migration should preserve existing IDs where possible, map legacy references explicitly, reconcile opening balances, and quarantine ambiguous unscoped records for review. Use a dry run and a backed-up migration; avoid permanent dual writers. Detailed migration steps require inspection of actual deployment and stored data.

## Deliberately later

Android, inter-store balancing, advanced forecasting, national/weather-driven purchasing, automated vendor placement, elaborate health percentages, and additional appearance customization should follow the pilot. Product enrichment is useful, but it should not displace correct stock, expiration, approval and history behavior.

The first usable milestone is an accurate and explainable operational loop. The broader intelligence platform can then grow from records the business trusts.
