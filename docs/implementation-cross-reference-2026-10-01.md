# Inventraker implementation cross-reference

Audited October 1, 2026 against `docs/implementation-roadmap-2026-09-30.md`, the current source tree, Firestore rules, deterministic checks, a production web build, and an unsigned iPhoneOS build.

## Overall result

The operational core described in Phases 1–5 is present and its deterministic suites pass. It is not ready to claim full roadmap completion because Phase 0 is only partially applied across the product, the required live department pilot has not occurred, and the shared ComplicatedAI connection is intentionally deferred. Later phases should be described as implemented behind the Phase 0 gate rather than production-complete.

| Phase | Audited status | Primary code evidence | Verification | Remaining gate |
|---|---|---|---|---|
| 0 — trust boundary | Partial | `src/lib/mobile-api.ts`; scoped mobile routes under `src/app/api/mobile/v1`; `firebase/firestore.rules`; explicit demo switch in `src/lib/server-data.ts` | Typecheck, lint, production build | Apply verified principal/org/store/department scope to legacy web, search, import, files, `/api/ai/*`, and `/api/intelligence/*`; add authorization/emulator matrix |
| 1 — stock operations | Implemented behind Phase 0 | `src/lib/stock-operations.ts`; action routes for spot check, receive, waste, restock, transfer, and par change; `src/lib/web-stock-operations.ts`; iOS API/session operation calls | `scripts/check-stock-invariants.mts` | Full deployed workflow acceptance; Phase 0 closure |
| 2 — batches and expiry | Implemented behind Phase 0 | `src/lib/batch-allocation.ts`; receiving/waste/restock/transfer routes; inventory detail and iOS batch/use-first views; `scripts/migrate-inventory-batches.mjs` | Stock invariant suite | Dry-run and backed-up migration against production-shaped data; full device workflow acceptance |
| 3 — ordering lifecycle | Implemented behind Phase 0 | `src/lib/ordering-engine.ts`; `src/lib/order-contract.ts`; recommendation, draft, transition, and linked receipt routes; web/iOS order clients | `scripts/check-order-invariants.mts` | Live vendor/store acceptance, signed device, Phase 0 closure |
| 4 — Today and pilot | Feature implementation complete; live pilot pending | `src/lib/today-issues.ts`; mobile Today/Insights APIs; dashboard and iOS Home; operational issue persistence | `scripts/check-today-invariants.mts`; `scripts/check-pilot-cycle.mts` | Run the roadmap's real one-department cycle on deployed web and iPhone, including interruption and discrepancy |
| 5 — grounded analysis | Inventraker foundation complete; integration deferred | `src/lib/operational-intelligence.ts`; `src/lib/ai/privacy.ts`; `src/lib/intelligence/inventraker-product-adapter.ts`; protected operational tool endpoint | `scripts/check-operational-intelligence.mts` | Connect the shared AI service after its interface is available; retire or secure legacy intelligence endpoints before exposing them |

## Exit-gate evidence

### Phase 0

- Mobile requests derive organization membership from a verified Firebase token, reject suspended members, enforce permissions, require a store, and check the member's store scope.
- Firestore denies direct client writes to stock operations, batches, operational issues, order operations, and orders. Inventory quantity fields can only change through server operations.
- Live server collection reads return unavailable/empty data on failure unless `INVENTRAKER_DEMO_MODE=true` explicitly enables fixtures.
- The gate remains open because legacy server-rendered pages call default-organization data readers and legacy query/recommendation endpoints accept caller-selected organization IDs without the shared principal check. Department scope and systematic emulator authorization tests are also absent.

### Phases 1 and 2

- Stock mutation routes transact snapshot changes, append immutable actor-attributed events, use operation IDs for replay protection, reject duplicate item lines, and check expected revisions for observed counts.
- Batch allocation uses earliest expiry first by default, records overrides, represents unknown expiry, and reconciles snapshot quantities with batch totals.
- The migration tool defaults to a dry run, requires a backup path before applying writes, and quarantines ambiguous opening balances.

### Phase 3

- One versioned ordering engine serves web and iOS and freezes inputs, rule path, freshness, degraded flags, source references, suggested quantity, final quantity, and overrides.
- The state contract controls approval, recorded submission, partial/full receiving, reconciliation, and cancellation. The old direct submit route rejects bypass attempts.
- Linked receipts use retry-safe operations and update order outstanding quantities, stock, batches, and audit history together.

### Phase 4

- Today issues have deterministic stable IDs, scope, evidence, urgency, freshness, destinations, and open/resolved reconciliation.
- Observability reports balance mismatches, duplicate operations, unresolved count variances, and manager overrides.
- The automated pilot covers count → waste → order → approval → recorded submission → partial receipt → retry → full receipt → reconciliation → discrepancy resolution. It does not substitute for the roadmap's live pilot.

### Phase 5

- The protected endpoint exposes minimum-record deterministic tools for balance, expiry, events, orders, cost changes, comparable waste, and runout explanations.
- Facts carry source references, valid application links, timestamps, and named freshness states. Missing usage is explicit, and a declining balance is never labeled as sales, waste, or theft without records.
- Recursive filtering removes human actor and authentication fields before assistant use. Proposed actions are non-executable drafts and retain ordinary UI permission and approval requirements.
- Demand baselines require at least 28 verified observations, compare simple candidates on a seven-day holdout, and fall back to no adjustment. Reported errors are validation metrics, not probabilities.

## Verification record

- Web: TypeScript check, ESLint, and optimized Next.js production build passed.
- Operational suites: stock, ordering, Today, pilot cycle, and operational intelligence checks passed.
- iOS: a signed arm64 Debug build passed with Xcode 27.0 and the iOS 27.0 SDK.
- Physical device: the signed app was installed and launched successfully as `com.inventraker.mobile` on Ian's connected iPhone 16 Pro Max. This verifies build, signing, installation, and process launch; the full store workflow pilot remains outstanding.
