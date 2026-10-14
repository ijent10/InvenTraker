# Product modernization implementation plan

This plan follows the smallest safe path. Phase 0 is complete when these audit documents are reviewed. Later phases must not be treated as one destructive rewrite.

## Phase 0 — Audit

**Delivered:** repository map, current/target architecture, IDS, engine contract, Workspace Engine, AI architecture, and this migration plan.

**Key decision:** keep the Next.js/Firebase modular monolith and separate SwiftUI client. Preserve transactional mobile stock endpoints as the Inventory reference implementation.

**Gate:** reconcile the dirty iOS working tree before editing it; record a clean recovery point or commit the owner’s current work.

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

Remaining: engine-owned data providers for all 11 domains, richer Large/XL content, candidate selection and invalidation, native iOS workspace editing, and hardware accessibility/touch verification. This is a web Workspace Engine milestone, not completion of the product-wide phase.

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
| 1 Design foundation | IDS namespace delivered; shared controls and native tokens still pending |
| 2 Application shells | Existing shells preserved; full shell refinements pending |
| 3 Shared contracts | Workspace schemas and authenticated layout API delivered; domain event/outbox contracts pending |
| 4 Inventory reference | Existing stock transactions preserved; formal extraction pending |
| 5 Workspace Engine | Web editor and persistence delivered; provider completeness and native parity pending |
| 6 Remaining engines | Migration pending |
| 7 AI intelligence | Existing assistant preserved; workspace ranking integration pending |
| 8 Marketing | Existing public site preserved; final product-aligned update pending |
| 9 Release validation | Workspace-specific checks run; full product validation pending |
