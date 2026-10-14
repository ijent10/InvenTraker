# InvenTraker current-state architecture

Status: audited 2026-10-14. This document records observed code, not planned capability.

## Repository map

| Area | Location | Observed implementation |
|---|---|---|
| Public site and authenticated portal | `InvenTraker Website` | Next.js 14 App Router, React 18, TypeScript, Tailwind-generated CSS |
| Backend | same repository | Next.js route handlers, Firebase Admin, Firestore, Firebase Storage, Firebase Auth |
| Production hosting | same repository | Firebase App Hosting, GitHub source, backend `intrakbckend` |
| Current iOS application | `ios/InvenTracker` in the deployed repository | SwiftUI, Firebase authentication and versioned website API, Keychain credentials, on-device assistant adapter |
| Legacy iOS application | sibling repository `../InvenTracker` | Older SwiftUI/Firebase client with a dirty working tree |
| Android | none found | No Android project was observed |
| Shared package | none in the deployed repository | Web and iOS share contracts by convention rather than a generated package |

The sibling legacy iOS repository contains substantial uncommitted work and was audited read-only. Its embedded legacy web monorepo is currently deleted in that checkout. The active API-backed iOS client is in this repository under `ios/InvenTracker`; changes to that client do not require touching the dirty legacy checkout. This corrects the initial phase-zero repository attribution.

## Web application

The public site, sign-in flow, portal, administration tools, and JSON APIs run in one Next.js application. `AppShell` applies authentication and route permissions, renders a fixed desktop sidebar, a compact top toolbar, global search, notifications, and organization branding. Public paths are `/`, `/demo`, and `/signin`.

Portal pages exist for inventory, orders, health checks, history, files, assistant, insights, employees, organization, stores, vendors, products, account preferences, and platform administration. Several operational concepts are presented through history or mobile-only endpoints rather than independent web engines.

### Data access

- Firebase Auth supplies identity.
- `users/{uid}.defaultOrgId` selects the organization.
- `orgs/{orgId}/members/{uid}` supplies member details and permissions.
- Server data helpers read tenant collections with Firebase Admin.
- Firestore rules scope client access; server routes independently resolve a principal.
- Mobile mutation endpoints use Firestore transactions and operation IDs to avoid duplicate posting.
- Inventory batches, stock operations, history, waste, receiving, portions, orders, and notifications are persisted as organization-scoped collections.

### Existing stock integrity

The mobile endpoints for receiving, restocking, transfer, waste, spot checks, portioning, par changes, and order transitions use transactions. Each accepts an operation identifier, checks or creates an operation record, updates inventory and batches, and writes history. This is an important reference implementation and should be preserved while extracting engine boundaries.

### Dashboard and preferences

The dashboard currently renders static widget definitions from `demo-data.ts` with live summary values injected by the dashboard page. Layout persistence stores only an ordered array of widget IDs:

- browser key: `inventracker.dashboardLayout`
- cloud preference: `dashboardWidgetIds`
- customization: separate settings screen with HTML drag ordering, up/down buttons, add/remove, reset, and save
- rendering: responsive CSS grid with limited `Large` span support

Missing from the present runtime: grid coordinates, row spans, corner resizing, size snapping, shape preferences, device-specific layouts, revisions, collision handling, undo, in-place edit mode, provider manifests, and standard widget states.

## iOS application

The current SwiftUI client is `ios/InvenTracker/InvenTracker.xcodeproj`. Its README identifies it as the fresh API-backed client. `AppSession` and `APIClient` request operational reads and writes from `/api/mobile/v1`; clients do not own an inventory database or primary recommendation math. It includes Home, Today, Inventory, configurable work shortcut, Account, scanner-based operations, Cut & Portion, Orders, Health Checks, Insights, and Assistant views.

Current native foundations live in `Design/AppTheme.swift`; shared screens are in `Views`. The web Workspace Engine is not yet consumed by this client. Native workspace editing and the proposed Home/Inventory/Activity/Assistant/More navigation remain future work.

The legacy sibling app retains the older direct Firebase/Functions services and offline pending-action queue. Those legacy capabilities must not be claimed as implemented in the current API-backed app without separate verification.

The available host has Swift command-line tools but no discoverable full Xcode installation. Native source syntax can be checked, but iOS SDK type checking, simulator builds, signing, and device runs cannot currently be verified on this host.

## AI and intelligence

The website already separates several concerns:

- local engine and Ollama integration
- OpenAI-compatible provider integration
- context construction and privacy filtering
- structured responses
- tool orchestration
- product resolution and product intelligence
- knowledge, learning, and memory stores
- operational decision selection
- retail intelligence adapters and retrieval

The assistant surface is therefore existing but incomplete rather than missing. Provider behavior does not yet implement one formal capability-negotiated `AIProvider` interface. Some tool connectors are explicit placeholders. AI recommendations must remain advisory and must never post stock movements directly.

## Authentication and authorization

Permission keys cover inventory, orders, health checks, history, files, AI, insights, products, vendors, employees, organization, stores, and platform administration. The portal filters navigation and blocks routes, while Firestore rules and API principal resolution provide backend enforcement. Store/location scope exists but is not expressed as one shared authorization contract across every engine.

## Testing and delivery

The website has TypeScript/build validation and domain invariant scripts for stock, orders, today issues, pilot cycles, and operational intelligence. The current API-backed iOS client and the legacy sibling client each have an Xcode project. The production site deploys through Firebase App Hosting from GitHub. Automated coverage is strongest around existing stock/order invariants and weaker around accessibility, UI interaction, engine contracts, event publication, and workspace behavior.

## Classification

### Existing and working

- Firebase authentication and organization membership
- Permission-aware portal shell and mobile API principal resolution
- Tenant-scoped Firestore records
- Transactional, idempotent core stock mutations
- Operational history records
- Barcode and operational screens in the current API-backed iOS client
- Public site, portal, and App Hosting delivery
- Theme and workspace preference persistence
- Assistant context/tool foundations

### Existing but incomplete

- Widget customization and cloud sync
- Global search breadth
- Model-provider abstraction
- Insights and recommendation provenance
- Location-scoped authorization consistency
- Offline conflict presentation
- Engine-specific web experiences

### Missing

- Formal 11-engine ownership and provider contracts
- Versioned event envelope and reliable outbox
- Workspace Engine grid layout, resizing, shapes, revisions, and conflicts
- Widget candidate contract and deterministic ranking service
- Unified IDS tokens shared by web and iOS
- Android application

## Primary risks

1. Splitting data ownership too early could break proven transaction boundaries.
2. The web and iOS repositories can drift because contracts are handwritten.
3. Existing `demo-data` types are used by production components; the name does not mean the code is unused.
4. The legacy iOS working tree is dirty and must not be overwritten or broadly reformatted; active client changes belong in `ios/InvenTracker`.
5. A second recommendation implementation would violate the single-engine rule in the iOS repository.

## Test and rollback baseline

Before each migration phase, record production commit, Firestore rules/index versions, API schema version, and iOS build. Additive fields and routes should ship before clients consume them. Keep compatibility readers until both clients migrate. Roll back UI phases by commit; roll back schema behavior with feature flags and compatibility adapters rather than deleting stored data.
