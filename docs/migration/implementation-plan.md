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
| 3 Shared contracts | Workspace contracts plus validated command/event/result/error envelopes delivered; atomic stock outbox staging delivered; dispatcher/consumer receipts pending |
| 4 Inventory reference | Front/back transfer, spot-check reconciliation and receiving application services/repositories extracted, both API versions share them, all seven stock actions stage atomic ledger/events; remaining command extraction and reconciliation pending |
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
