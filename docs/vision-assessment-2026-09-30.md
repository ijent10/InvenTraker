# Inventraker: current project compared with the product vision

Assessment date: September 30, 2026. Basis: the supplied Inventraker brief and the local working trees, including uncommitted changes.

**Assessment: Inventraker has a substantial application foundation and several implemented operational workflows. It does not yet provide the dependable, connected operational intelligence described in the brief. The next investment should connect and harden the inventory lifecycle before expanding forecasting or the assistant.**

## Scope and confidence

The primary assessment target is `/Users/ian/Desktop/Projects/InvenTraker Website`: its Next.js/Firebase platform and its new SwiftUI client under `ios/InvenTracker`. Its README explicitly identifies the former mobile implementation as reference material. The neighboring `/Users/ian/Desktop/Projects/InvenTracker` contains the older SwiftData app and valuable domain work. That older working tree also contains many deletions and modifications; nothing was restored or changed during this review.

The assessment includes current uncommitted receiving, transfer, insights, and iOS changes. Their presence locally does not establish that they are deployed. The latest primary-repository commit inspected was `78beb60`; the working tree extends beyond that commit.

“Implemented” below means a concrete code path exists, not that it has passed an end-to-end production acceptance test. TypeScript checking and ESLint passed. No production requests, database writes, deployments, dependency upgrades, or application-code changes were performed. Production Firebase rules, actual customer data, iOS compilation, and authenticated runtime behavior were not verified. The assistant evaluation script was inspected but not run; it requires a running service and can invoke external services.

## What is already worth keeping

- A useful separation between central catalog identity, organization products, store-specific details, and stock.
- A broad web workspace covering inventory, products, orders, vendors, employees, stores, history, files, and administration.
- A server-driven iPhone client with authentication and operational API calls.
- Transactional mobile count, waste, receiving, restocking, and floor/backstock transfer paths.
- Editable order drafts, vendor minimums, notes, and line-level recommendation fields.
- Capability names, membership records, permission-aware UI, and mobile token verification.
- Document ingestion/retrieval, product resolution, enrichment review, and an assistant privacy contract.
- Older batch/expiration models that can inform the rebuilt server data model.

This supports an incremental completion plan. Another wholesale UI rewrite would delay the more important work.

## Capability comparison

| Vision area | Current local implementation | Remaining work |
|---|---|---|
| Persistent product profile | Central catalog, organization product records, store detail paths, nutrition and display data | Stable references everywhere; product-linked stock events, batches, orders, documents, and cost/par history |
| Contextual inventory | Front/back/on-hand quantities, pars, reorder thresholds; mobile counts write count timestamps | Previous count, expected quantity, variance, freshness and confidence must become consistent across clients |
| Pars and replenishment | Stored par/reorder fields and browser-generated order quantities | Audited par changes; delivery-window demand, incoming stock, expiring stock, conversions, and one server calculation |
| Editable ordering | Vendor drafts, editable quantities/notes, minimum checks, submission status | Reliable approval boundary, preserved suggested versus final quantities/reasons, lifecycle and supplier handoff |
| Vendors | Vendor lists, contacts, minimums, lead-time strings and catalog references | Complete vendor editing, structured cutoffs/delivery schedules, alternatives, shortages and service history |
| Expiration | Expiration flag; mobile receipt/count dates | Live quantities per batch, earliest-expiring-first consumption, opened stock, batch splits and usable-stock projections |
| Departments and stores | Fields, store records, scope-related membership fields and mobile store checks | Enforced department boundaries and uniform store scoping on every read/write |
| Health and attention | Low-stock counts, scheduled check records, simple recommendation rules | Prioritized operational issues with evidence, deadlines, ownership, resolution and incoming-order suppression |
| Operational history | History pages; mobile actions create history in the stock transaction | Complete before/after/delta records; web parity; append-only corrections; immutable recommendation and approval evidence |
| Receiving | New mobile endpoint adds received quantity and a receiving record | Match receipts to purchase-order lines; partial deliveries, substitutions, shortages and reconciliation |
| Waste and cost | Waste quantities/reasons; price/case fields; mobile 30-day waste summaries | Batch/cost attribution, usage denominators, comparable time windows and accurate valuation |
| Documentation | Company files, approval metadata, ingestion, chunks and retrieval | Consistent product/vendor/process associations and requester-specific access enforcement throughout retrieval |
| Assistant | Local resolution, structured answers, tool orchestration, enrichment and external model integration | Scoped live facts, traceable calculations and provenance; shared ComplicatedAI integration is not evidenced in inspected sources |
| Search | Global text search across operational entities; product resolution | Scoped search first, then structured filters and validated natural-language query plans |
| Forecasting and anomalies | Rule-based recommendations and fixed confidence values | Real movement history, explicit uncertainty, demand backtests and unexplained-variance cases |
| Phone experience | Count, restock, discard, receive, transfer, order review/submission and basic insights | Retry safety, connectivity/conflict behavior, complete health-check submission and batch handling |
| Business/personal modes | Organization/store structure fits professional use | Focus initial release on one perishable department; keep household pantry scope with SimpliPantri |

## Findings that should determine implementation order

### 1. Server access and organization scope need to become universal

Mobile requests verify a token and organization membership. However, `assertStoreAccess` returns when no store is supplied, while the inventory and order list endpoints accept an omitted store and then return organization-wide results. Records without a store ID also match a selected store. Department scope is not enforced in these inspected paths.

The web server data helpers use Firebase Admin and default to a configured organization. The inventory page and root layout call those helpers before the client-side access UI. Search and recommendation API routes inspected do not authenticate the caller. A client-side sign-in screen does not establish authorization for server reads or API responses. These are code-level access gaps; production exposure depends on deployment configuration and has not been probed.

Firestore rules also lack a suspended-member check in their membership helper, allow broad organization-member reads for several collections, and allow order creators to update order documents without protecting approval status. A hidden Submit button is therefore insufficient to enforce the intended approval boundary.

Evidence: [server data](</Users/ian/Desktop/Projects/InvenTraker Website/src/lib/server-data.ts:74>), [root layout](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/layout.tsx:18>), [search API](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/api/search/route.ts:45>), [mobile scope](</Users/ian/Desktop/Projects/InvenTraker Website/src/lib/mobile-api.ts:162>), [order rules](</Users/ian/Desktop/Projects/InvenTraker Website/firebase/firestore.rules:265>).

### 2. Demonstration data can look like business facts

Server read helpers return demo records when the database is unavailable or a read throws. This can make an outage appear to be valid stock. The web Insights page imports its metrics directly from demo data. Assistant context mixes fetched inventory with static `wasteSignals`, `productEvidence`, and `nationalSignals`. Its recommendations function accepts `orgId` but explicitly ignores it.

The new mobile insights endpoint does read operational collections, which is useful progress. It is distinct from the web demo insights and assistant context. Its summed “units” can also combine unlike measures; pounds and eaches need separate reporting or explicit conversions.

Evidence: [fallback reads](</Users/ian/Desktop/Projects/InvenTraker Website/src/lib/server-data.ts:74>), [web insights](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/insights/page.tsx:6>), [assistant context](</Users/ian/Desktop/Projects/InvenTraker Website/src/lib/ai/context.ts:1>), [recommendations](</Users/ian/Desktop/Projects/InvenTraker Website/src/lib/intelligence/recommendations.ts:17>), [mobile insights](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/api/mobile/v1/insights/route.ts>).

### 3. Stock and history do not yet share one write contract

Mobile mutations correctly use transactions for stock and related records. The web inventory form instead writes product, inventory, and store details sequentially. It hardcodes `store-001` and does not append a stock-change or par-change event. A later failed write can leave a partially saved operation.

Mobile receipt/waste requests have no request deduplication key. Retrying a successful request can apply it again. Multiple lines referencing the same item read the same initial snapshot and compute independent replacements: receiving +2 and +3 against 10 can leave 13 rather than 15 while recording both receipts. Counts likewise need duplicate-item validation and explicit stale-count handling. Transactions alone do not solve those problems.

Mobile status handling also differs: receiving sets `Active` unconditionally; waste does not recompute status. Other screens sometimes use that status and sometimes derive low stock from quantities.

Evidence: [inventory form](</Users/ian/Desktop/Projects/InvenTraker Website/src/components/inventory-form.tsx:65>), [receiving](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/api/mobile/v1/actions/receive/route.ts:32>), [waste](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/api/mobile/v1/actions/waste/route.ts>), [spot checks](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/api/mobile/v1/actions/spot-check/route.ts>).

### 4. Order generation contradicts the intended behavior

The browser generates recommended quantities itself. A normal item at or above par still receives a minimum recommendation of one. A low item can receive its entire reorder-point quantity rather than just its shortage. The builder can add extra stock to meet a vendor minimum and has a browser-timer auto-submit path.

Web submission writes a fixed person's name as submitter/approver. Neither the reviewed web submission nor the mobile submission path transmits an order to a supplier; they change database status. Calling that “Submitted” needs a clear distinction between internal approval and actual vendor transmission.

The older repository's engineering rules require a single backend recommendation engine with versioned, traceable outputs. Those rules are not in the rebuilt repository's directory ancestry, but they are valuable existing design intent. The rebuild has browser order math, separate server business recommendations, and server restock math without a shared recommendation contract. The old boundary-check command is absent from the rebuilt package scripts.

Evidence: [draft generation](</Users/ian/Desktop/Projects/InvenTraker Website/src/components/order-draft-builder.tsx:144>), [submission](</Users/ian/Desktop/Projects/InvenTraker Website/src/components/order-draft-builder.tsx:261>), [mobile order submission](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/api/mobile/v1/orders/[orderId]/submit/route.ts>), [older engineering rules](/Users/ian/Desktop/Projects/InvenTracker/AGENTS.md).

### 5. Expiration depth exists in the older app, but is not carried through the rebuild

The older `Batch` model has quantity, expiration, received date, stock area, identity and split behavior. The older inventory model holds multiple batches. The new inventory type stores an expiration flag, and new receiving stores an expiration date per receipt plus a latest-date field on inventory. There is no current remaining-quantity-per-batch workflow in the inspected rebuild.

Receipt records alone cannot tell which units were sold, wasted, counted or moved afterward. Reliable “use first” and “likely to expire” answers depend on that allocation.

Evidence: [older batch model](/Users/ian/Desktop/Projects/InvenTracker/Models/Batch.swift:22), [older inventory](/Users/ian/Desktop/Projects/InvenTracker/Models/InventoryItem.swift:67), [rebuilt types](</Users/ian/Desktop/Projects/InvenTraker Website/src/lib/demo-data.ts:23>), [new receiving](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/api/mobile/v1/actions/receive/route.ts>).

### 6. Some controls save a generic form snapshot rather than completing their named workflow

An `ActionButton` without a custom action writes `formSaves` and reports its supplied success label. Examples include Add vendor and Refresh adaptive insights. That is scaffolding, not evidence of vendor creation or recalculated insights. Health-check detail views show schedules and previous responses; the inspected new iOS view does not submit answers.

Similarly, a scheduled operational checklist is distinct from automatically calculated inventory health. Both are useful, but the latter needs its own evidence and issue lifecycle.

Evidence: [action fallback](</Users/ian/Desktop/Projects/InvenTraker Website/src/components/action-button.tsx>), [vendors](</Users/ian/Desktop/Projects/InvenTraker Website/src/app/vendors/page.tsx>), [iOS health details](</Users/ian/Desktop/Projects/InvenTraker Website/ios/InvenTracker/InvenTracker/Views/OperationsView.swift:818>).

## Product decisions recommended by this review

1. Treat the rebuilt web/API repository and its iOS client as the proposed development baseline; treat the older app as a source of domain behavior to port deliberately. Confirm which app is actually used before retiring anything.
2. Target a manager and associates in one perishable department at one location for the first pilot. Maintain organization/store/department isolation from the start.
3. Make every quantity explainable: current stock, timestamp, evidence quality, and the events that produced it.
4. Keep manager approval explicit. Separate “draft,” “approved,” and “sent to supplier.” Disable automatic submission for the first pilot.
5. Prefer a small list of specific operational issues over a percentage health score. Fixed confidence constants do not establish calibrated prediction quality.
6. Keep user identities available to authorized audit screens while preserving the existing assistant's stricter privacy contract. Do not weaken that contract to answer “who changed this.”
7. Move business types out of `demo-data.ts` so production contracts and fixture records have clearly separate ownership.

The corresponding [implementation roadmap](</Users/ian/Desktop/Projects/InvenTraker Website/docs/implementation-roadmap-2026-09-30.md>) turns these findings into release gates and a first backlog.
