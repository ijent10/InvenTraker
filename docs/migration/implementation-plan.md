# Product modernization implementation plan

This plan follows the smallest safe path. Phase 0 is complete when these audit documents are reviewed. Later phases must not be treated as one destructive rewrite.

## Phase 0 — Audit

**Delivered:** repository map, current/target architecture, IDS, engine contract, Workspace Engine, AI architecture, and this migration plan.

**Key decision:** keep the Next.js/Firebase modular monolith and the API-backed SwiftUI client under `ios/InvenTracker`. Preserve transactional mobile stock endpoints as the Inventory reference implementation.

**Gate:** preserve the dirty legacy sibling checkout. Native changes belong in the active `ios/InvenTracker` client. A full Xcode toolchain is required before native release validation.

## Phase 1 — Design foundation

Map current CSS variables to IDS semantic tokens; add spacing, radius, typography, motion, contrast, and status tokens. Refactor common web controls without changing feature behavior. Add an iOS `IDS` namespace using native SwiftUI semantics. Build token/state accessibility tests.

**Risk:** broad visual regression. **Rollback:** compatibility aliases and component-level flags. **Data migration:** none.

## Phase 2 — Application shells

Public site: add restrained sticky navigation and product/solutions/features/pricing destinations using verified capability claims. Portal: collapsible sidebar, organization/location switcher, compact toolbar, consistent engine navigation, inspector primitive. Mobile: Home, Inventory, Activity, Assistant, More tabs with existing screens routed through them.

**Dependencies:** Phase 1. **Tests:** responsive, keyboard, screen reader/VoiceOver, permission-filtered navigation. **Rollback:** shell feature flag.

## Phase 3 — Shared engine contracts

Add principal, command, result, error, event, widget definition, and candidate schemas. Introduce `/api/v1` conventions and adapters from existing mobile routes. Add an outbox abstraction without changing current transaction behavior.

**Risk:** client contract drift. **Tests:** JSON fixtures validated by TypeScript and Swift. **Rollback:** retain `/api/mobile/v1`.

## Phase 4 — Inventory reference engine

Wrap existing stock/batch transaction logic behind Inventory commands and repositories. Add ledger reconciliation and explicit movement types. Route receiving, restock, waste, transfer, portion, and spot-check reconciliation through the same application boundary while preserving atomic writes.

**Risk:** stock corruption/double posting. **Tests:** repeated command IDs, transaction failure, receive once, transfer dispatch/receipt, discard, portion yield, spot-check adjustment. **Rollback:** route flag to existing handlers; never delete ledger entries.

## Phase 5 — Workspace Engine

Add versioned layout schemas and widget registry. Convert legacy ordered IDs additively. Implement provider-aware rendering, in-home edit mode, add/remove, undo/reset, direct drag, corner resizing, snapping, collision/reflow, shapes, device variants, revision conflicts, and cloud persistence. Start with deterministic widget data.

**Dependencies:** Phases 1 and 3. **Tests:** documented in `widget-runtime.md`. **Rollback:** `workspaceLayoutV2` flag and legacy preference reader.

## Phase 6 — Remaining engines

Migrate in transaction-risk order:

1. Spot Check and Receiving
2. Restock and Orders
3. Discards and Transfers
4. Cut & Portion
5. Health Checks
6. Insights

Each migration adds web experience, API/state contracts, events, provider definitions, authorization tests, and cross-engine stock tests before the next begins.

## Phase 7 — AI intelligence

Formalize provider adapters and tool gateway. Add validated engine candidates, deterministic scoring, optional AI reranking/summarization, caching, traceability, and safe write proposals. Preserve the single backend recommendation engine and fallback-only client modules.

## Phase 8 — Marketing website

Bring the public site onto IDS and the verified 11-engine grouping: Track, Move, Operate, Understand. Demonstrate the real Workspace Engine and mobile flows. Advertise only capabilities present in the released product. Keep one final CTA.

## Phase 9 — Release validation

Run accessibility, responsive, Core Web Vitals, authorization, tenant isolation, Firestore rule, API contract, stock integrity, widget, offline/conflict, provider-failure, and iOS device tests. Use progressive flags and deployment revisions. Record production version and rollback command for each release.

## Immediate next implementation slice

1. Create IDS web token aliases and shared status/control primitives.
2. Add contract schemas for `DashboardLayout`, `WidgetInstance`, `WidgetDefinition`, and `WidgetCandidate` without switching rendering.
3. Add pure packing/snap/revision utilities with unit tests.
4. Convert current widget definitions into a provider registry adapter.
5. Render the existing dashboard through the adapter behind a flag.

This slice is additive, independently testable, and does not touch stock data.

### Foundation progress

Implemented the IDS token namespace, validated workspace schemas, pure packing/move/resize/snap/compaction utilities, device adaptation, revision comparison, registry validation/permission filtering, and legacy migration metadata adapter. Added `workspace:check` with collision/bounds tests across all device classes and multiple generated placement scenarios.

Web runtime delivered: transactional cloud persistence, in-home editor, pointer drag and corner resizing, keyboard alternatives, four-size snapping, shape surfaces, undo/reset/cancel, local draft recovery, revision-conflict presentation, migration from legacy preferences, and a build-time rollback switch. Browser and API integration checks are recorded in `widget-runtime.md`.

Store-scoped summary providers now cover all 11 operational domains. Large/XL widgets support deterministic automatic priorities and a pinned priority, with expiry and failure isolation. Native iOS workspace editing, domain-owned command/event extraction, and hardware accessibility/touch verification remain. This is a web Workspace Engine milestone, not completion of the product-wide phase.

## Definition of done for every phase

- Existing behavior inventory updated.
- New contracts documented and versioned.
- Authorization and tenant/location scope verified server-side.
- Critical tests pass on web and affected iOS targets.
- Migration and rollback are executable.
- Production telemetry distinguishes old/new paths.
- No capability is marked complete solely because a screen exists.


## Phase status after web workspace integration

| Phase | Status |
|---|---|
| 0 Audit | Documentation delivered |
| 1 Design foundation | IDS namespace and web control geometry/status semantics delivered; native semantic token namespace and motion support added; iOS SDK build verification pending |
| 2 Application shells | Web sidebar collapse, compact navigation, skip link and focus semantics delivered; native shell and full engine navigation pending |
| 3 Shared contracts | Workspace contracts plus validated command/event/result/error envelopes delivered; atomic stock outbox staging plus the scheduled workspace consumer/receipts delivered; other consumers and monitoring pending |
| 4 Inventory reference | All seven existing stock commands extracted behind shared application services/repositories and both API adapters; atomic ledger/events and read-only reconciliation review delivered; workspace event delivery enabled; broader workflows and native validation pending |
| 5 Workspace Engine | Web editor, persistence, scoped summary providers and deterministic priority content delivered; native parity and full domain extraction pending |
| 6 Remaining engines | Migration pending |
| 7 AI intelligence | Deterministic workspace priorities delivered; optional AI reranking and provider integration deferred |
| 8 Marketing | Existing public site preserved; final product-aligned update pending |
| 9 Release validation | Workspace-specific checks run; full product validation pending |

## Store summary provider milestone

Added an authenticated, read-only `/api/v1/workspace/widgets` gateway. It rechecks membership, source permissions and store assignment, projects an explicit field allowlist, loads only sources required by visible widgets (plus authorized priority dependencies), bounds each source to 1,000 records, and labels incomplete counts. A failed source does not blank unrelated widgets. Private employee identities and assistant conversations are excluded.

Added Spot Checks, Receiving, Transfers, and Cut & Portion to the compatible catalog. These expose existing stock-ledger/receiving/portion activity; they do not imply spot-check sessions, interstore transfer tracking, or a recipe production engine. Legacy history/vendor/employee/review tiles remain navigation where no scoped provider is supplied. Existing layouts retain their IDs and summary mode.

The client refreshes visible summaries once per minute, suspends background polling, aborts requests on context changes, and labels stale or unavailable results. Large/XL content uses source-authorized candidates, critical-first deterministic scores, expiry, and summary/automatic/pinned modes. No AI service is called by this new gateway.

Validation: provider invariant checks, existing workspace invariants, type checking and production build; authenticated local integration with the existing test organization for owner/employee, unauthenticated rejection, organization rejection and unassigned-store rejection. Browser checked catalog addition, corner keyboard resize, pinned selection, cloud save and rendered priority content. Native build/device validation remains unavailable without the full Xcode toolchain.

## Inventory reference milestone

Extracted front/back transfers behind the Inventory application/repository boundary. Both API versions share one movement implementation; the old mobile response remains compatible. Added payload-aware replay validation, canonical-precision validation and current tenant/store/permission checks before repository access. Shared TypeScript and actual Swift model fixtures validate the response boundary.

All seven stock operations now atomically stage a minimal event with their existing ledger write. Real Firestore tests on isolated fake-organization records verified retry behavior, receiving once, concurrent stock protection and full rollback when event creation fails. No dispatcher is enabled; delivery, consumer receipts, event-driven workspace refresh and remaining engine extraction are still pending. Native UI/device verification still needs the full Xcode toolchain.

## Spot-check reconciliation milestone

Moved count reconciliation into the Inventory application service and Firestore repository, retaining the mobile route as an adapter and adding the versioned count endpoint. Preserved revision checks and batch reconciliation, added payload-aware retry protection and safe transaction-size checks. Saved count results are not duplicated in ledger metadata.

Validation covers domain invariants, active Swift inventory model decoding, and real Firestore integration in isolated fake-organization records: count/transfer API parity, repeated commands, competing counts, stale multi-item rejection, reconciled batch totals and complete rollback when event creation fails. Count sessions/approval workflows, remaining command extraction, event delivery and native device validation are still pending.

## Receiving command milestone

Moved Receiving behind an Inventory application service and transaction repository; the mobile adapter preserves its result and a versioned receipt endpoint uses the shared engine contract. Added payload-aware replay validation and original-receipt verification for historical ledger entries.

Fixed inconsistent physical/order-unit receipts and repeated partial-case rounding. The shared Orders contract now tracks canonical received stock and derives order-unit progress, with the legacy helper delegating to that calculation. Existing order progress is preserved conservatively.

Domain, shared order/pilot, Swift fixture, build and real Firestore checks cover receiving once, partial/full receipts, invalid status, scope, unit mismatch, over-receipt, concurrency, distinct expiration batches and rollback across the order and stock records. Shipment sessions/discrepancy workflows, remaining stock command extraction, event delivery and native device validation remain pending.

## Restock command milestone

Moved Restock preview/commit behind the Inventory application/repository boundary and added the versioned endpoint. Preview metadata distinguishes generation from commitment; commit fingerprints prevent replaying different counts. Versioned commits require a preview revision and reject competing/stale observations. Legacy mobile callers remain compatible, with optional revision protection.

Retained the pull rule and floor-count reconciliation. Explicit undated batches cover found floor stock, pulled stock without batch details and remaining untracked backstock. Invalid over-covered backstock and malformed batch data fail before writes. Native source carries preview revisions, invalidates edited previews and requires recount after a conflict.

Domain, Swift fixture/syntax, build and isolated Firestore checks verify previews are read-only, API parity, retry safety, revision conflicts, quantity conservation after count variance, complete batch coverage and rollback. The full Xcode toolchain is still unavailable; native build/device validation, restock request/assignment workflows, remaining commands and event delivery are pending.


## Discard command milestone

Moved waste recording behind the Inventory application service/repository, preserving the mobile waste response and adding a versioned discard endpoint. Commands now check payload details on retry, including reasons and preferred batch selection; historical results are checked against their original waste entries. Two-area changes advance each item once, and a failed line prevents the entire operation.

Retained earliest-expiring and preferred-batch-first behavior. Affected stock areas preserve remaining untracked quantities as explicit undated batches. Invalid batch balances, excess stock removal, noncanonical precision, duplicate item/area lines and oversized transactions are rejected before writes. Stock, batch allocation, waste entries, history and staged events share the transaction.

Validation includes domain checks, Swift request/response fixtures, production build and isolated Firestore integration for API parity, retry conflicts, preferred allocation, competing discards, two-area changes, missing batch coverage and rollback. Native app code did not change in this milestone; device validation remains pending. Production/portion and threshold extraction, standalone Discards review workflows and event delivery remain pending; AI integration stays deferred.


## Cut & Portion command milestone

Moved the mobile portion action behind the Inventory application service/repository and added the versioned portions endpoint. Canonical weights prevent rounding a total differently from package weights. Per-package allocations preserve actual source lineage and unknown weight, while affected-area undated remainder batches preserve aggregate coverage. A selected source must cover the full cut.

Physical stock stays unchanged and the item revision advances once. Outputs preserve source expiration limits and received age conservatively, record separate portioning time and manual date provenance, and use operation-specific package barcodes. Payload-aware retries validate all cut details; historical retries verify original records without rewriting them.

Validation covers domain conservation/precision, expiry rules, lineage, selected batch limits, authorization, retries and transaction bounds, plus actual Swift models, production build and isolated Firestore tests for API parity, stale count rejection after cutting, competing cuts and complete rollback. This completes the existing cut command extraction, not the full Production engine: recipes, yields/loss, printing, event delivery, threshold extraction and device validation remain pending. AI integration remains deferred.


## Threshold command milestone

Extracted inventory par/reorder changes behind the shared Inventory application service/repository, with a versioned thresholds endpoint and compatible mobile adapter. Canonical target validation, revision checks and payload-aware replay prevent invalid, stale or mismatched updates; historical retries verify the saved policy change. Target updates preserve physical stock and batches.

Linked store-product targets, inventory revision/status, history, policy ledger and staged event save atomically, preserving unrelated product fields. Domain/Swift fixtures, production compilation and isolated Firestore checks cover status boundaries, changed-reason conflicts, competing revisions, API parity and rollback across both target records. All seven existing stock command extractions are now delivered. Full Phase 4, remaining engine workflows, broader reconciliation, event delivery and native/device validation are still pending.

Stripe readiness review is recorded separately in `docs/architecture/billing-readiness.md`; no live billing configuration is activated by this milestone.


## Sandbox billing foundation

Recorded the confirmed Builder/Basic/Pro base and per-store/per-employee prices. Created and verified nine sandbox prices, configured the Customer Portal, installed the webhook signing secret in Secret Manager and registered the sandbox webhook endpoint. Added an owner-only monthly quote/checkout page, authoritative primary-store quantities, verified customer mapping, quote fingerprints, idempotent checkout leases and canonical webhook state with durable receipts. Removed arbitrary-email portal sessions and redirect-based activation. Existing-email signup cannot reset passwords.

The stored sandbox server key is attached at runtime. Deployed checks passed for all tier quotes, exact Checkout line items, checkout retries/concurrency, portal authorization, signed webhook delivery/replays, failed payments/recovery and cancellation using an isolated organization that was cleaned up. Hosted-form completion remains unverified because the browser connection was unavailable; payment lifecycle checks used Stripe sandbox APIs and real webhooks. See `docs/architecture/billing-readiness.md` for evidence and boundaries. Automatic quantity reconciliation, plan-change/proration policy, feature enforcement and live tax/billing launch remain pending. No live billing is enabled. Also corrected threshold mirroring to the existing `productDetails` collection and updated the integration fixture to exercise the actual collection.


## Inventory reconciliation review milestone

Continued Phase 4 after the sandbox billing setup. Added a read-only, store-scoped stock review behind a versioned Inventory query and an Inventory → Review stock page. It compares saved stock/batches with reviewed ledger revisions, separates discrepancies from missing legacy baselines, detects physical continuity across target changes, and labels bounded/incomplete coverage. All source reads share a read-only Firestore transaction; it cannot repair or post stock. Findings are paginated and link to inventory items.

Validation covers balance/precision failures, invalid batches, duplicate and missing revisions, policy-only baselines, ledger drift, mixed-store rejection, partial coverage and unchanged inputs. Production build and rollout `2026-10-17-010` succeeded for commit `73b3dda`. Deployed integration checks passed for a consistent balanced snapshot, deliberately introduced drift, unauthenticated rejection, edit-permission enforcement, inactive membership, store and tenant isolation, minimal output, and unchanged document update times across read-only reviews. Isolated fixture records were removed. The browser connection remains unavailable, so visual/keyboard verification of the new page is pending. This does not finish Phase 4: full ledger-history tooling, event delivery, broader workflows and native device validation remain pending. AI remains deferred.


## Workspace event-delivery milestone

Continue Phase 4/contract infrastructure with an authenticated scheduled stock-event dispatcher and one Firestore workspace consumer. Canonical event/ledger validation, atomic receipts/cursors/status, duplicate and out-of-order handling, retry backoff and retained dead letters are implemented. The web workspace uses scoped revision checks with its existing refresh fallback; delivery does not modify inventory or call AI. Scheduler identity, required index and runtime pause flag are documented with rollback.

Pure checks cover event/ledger scope, key collisions, receipt idempotency, transaction failure, due-time gating, retry exhaustion and out-of-order invalidation. Production build and rollout `2026-10-17-012` succeeded for commit `4e0573d`. Deployed checks verified an actual API transfer reaching its workspace cursor through Scheduler OIDC, repeated delivery/receipt replay, old-event invalidation, cross-store quarantine, missing-ledger retry/recovery/exhaustion, failed-consumer isolation, cursor-read failure fallback, scoped revision permissions and client denial of all internal root records. Cloud Scheduler rejects simultaneous manual RunJob mutations, so test triggers were serialized; concurrent worker safety relies on Firestore transactions and receipt checks, and no concurrent-worker load test is claimed. The isolated fixture was removed. Scheduler was left enabled and a later automatic cron invocation succeeded. Browser interaction and native verification remain pending. Phase 4 as a whole remains incomplete.
