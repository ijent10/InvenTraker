# InvenTracker Web Rebuild – Requirements Checklist

This checklist maps requested requirements to implementation files and routes.

## 0) Monorepo structure + tooling

- [x] NPM workspaces (`apps/*`, `packages/*`, `functions`, `firebase`)
  - `/Users/ianjent/Desktop/InvenTracker/package.json`
- [x] Repo structure
  - `/Users/ianjent/Desktop/InvenTracker/apps/web`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui`
  - `/Users/ianjent/Desktop/InvenTracker/packages/shared`
  - `/Users/ianjent/Desktop/InvenTracker/functions`
  - `/Users/ianjent/Desktop/InvenTracker/scripts`
  - `/Users/ianjent/Desktop/InvenTracker/firebase`
  - `/Users/ianjent/Desktop/InvenTracker/meta/migrations`
- [x] Strict TS + lint/prettier/editor config
  - `/Users/ianjent/Desktop/InvenTracker/tsconfig.base.json`
  - `/Users/ianjent/Desktop/InvenTracker/.eslintrc.cjs`
  - `/Users/ianjent/Desktop/InvenTracker/.prettierrc`
  - `/Users/ianjent/Desktop/InvenTracker/.prettierignore`
  - `/Users/ianjent/Desktop/InvenTracker/.editorconfig`
- [x] CI workflow
  - `/Users/ianjent/Desktop/InvenTracker/.github/workflows/ci.yml`

## 1) Shared domain + validation contracts

- [x] Domain schemas + enums + contracts
  - `/Users/ianjent/Desktop/InvenTracker/packages/shared/src/enums.ts`
  - `/Users/ianjent/Desktop/InvenTracker/packages/shared/src/schemas/domain.ts`
  - `/Users/ianjent/Desktop/InvenTracker/packages/shared/src/schemas/functions.ts`
  - `/Users/ianjent/Desktop/InvenTracker/packages/shared/src/index.ts`

## 2) Firestore migrations + verification

- [x] Idempotent migration runner
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrate.ts`
- [x] Migration scripts
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrations/001_members_roles_normalization.ts`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrations/002_regions_districts_stores_backfill.ts`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrations/003_items_field_backfill.ts`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrations/004_inventory_batches_store_scope.ts`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrations/005_howto_steps_blocks_normalization.ts`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrations/006_platform_preference_profiles_backfill.ts`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrations/007_audit_logs_root_backfill.ts`
- [x] Migration registry docs
  - `/Users/ianjent/Desktop/InvenTracker/meta/migrations/README.md`
  - `/Users/ianjent/Desktop/InvenTracker/meta/migrations/registry.json`
- [x] Schema verification with required field checks
  - `/Users/ianjent/Desktop/InvenTracker/scripts/verify-schema.ts`

## 3) Firebase rules/indexes/storage rules

- [x] Firestore RBAC + tenant rules
  - `/Users/ianjent/Desktop/InvenTracker/firebase/firestore.rules`
- [x] Firestore indexes
  - `/Users/ianjent/Desktop/InvenTracker/firebase/firestore.indexes.json`
- [x] Storage rules
  - `/Users/ianjent/Desktop/InvenTracker/firebase/storage.rules`
- [x] Emulator config
  - `/Users/ianjent/Desktop/InvenTracker/firebase.json`

## 4) Cloud Functions backend

- [x] Callable functions implemented
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/index.ts`
  - `ensurePlatformPreferenceProfile`
  - `pdfToHowtoDraft`
  - `generateOrderSuggestions`
  - `computeFinancialHealth`
  - `adminSafeEdit`
  - `adminListOrganizations`
  - `adminGetOrganizationDetail`
  - `adminGetStoreDetail`
  - `adminListAuditLogs`
- [x] Auth/role middleware utilities
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/lib/auth.ts`
- [x] PDF parser pipeline utility
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/utils/pdf.ts`
- [x] Preference clone/init utility
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/utils/preferences.ts`
- [x] Safe-edit whitelist utility
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/utils/admin-safe-edit.ts`

## 5) UI system (iOS-style soft cards)

- [x] Token system (radius/shadow/borders)
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/styles/tokens.css`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/globals.css`
- [x] Reusable UI components
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/app-card.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/metric-chip.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/icon-tile.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/tip-banner.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/data-table.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/search-input.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/segmented-control.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/modal.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/tabs.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/packages/ui/src/components/toast.tsx`
- [x] Semantic accent lock helper
  - `/Users/ianjent/Desktop/InvenTracker/packages/shared/src/utils/theme.ts`

## 6) Web routes/pages

### Public/Auth
- [x] `/`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(public)/page.tsx`
- [x] `/signin`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(auth)/signin/page.tsx`
- [x] `/signup`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(auth)/signup/page.tsx`
- [x] `/signout`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(auth)/signout/page.tsx`

### Signed-in app shell + nav
- [x] App shell (sidebar/topbar/mobile nav + org/store switchers + avatar)
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/components/app-shell.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/layout.tsx`

### Core modules
- [x] `/app` dashboard
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/page.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/components/dashboard-module-card.tsx`
- [x] `/app/org`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/org/page.tsx`
- [x] `/app/stores`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/stores/page.tsx`
- [x] `/app/stores/[storeId]`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/stores/[storeId]/page.tsx`
- [x] `/app/inventory`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/inventory/page.tsx`
- [x] `/app/inventory/[itemId]`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/inventory/[itemId]/page.tsx`
- [x] `/app/expiration`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/expiration/page.tsx`
- [x] `/app/waste`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/waste/page.tsx`
- [x] `/app/orders`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/orders/page.tsx`
- [x] `/app/todo`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/todo/page.tsx`
- [x] `/app/insights`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/insights/page.tsx`
- [x] `/app/production`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/production/page.tsx`
- [x] `/app/howtos`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/howtos/page.tsx`
- [x] `/app/howtos/[guideId]`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/howtos/[guideId]/page.tsx`
- [x] `/app/users`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/users/page.tsx`
- [x] `/app/settings`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/settings/page.tsx`

### Admin
- [x] `/admin`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/admin/page.tsx`
- [x] `/admin/org/[orgId]`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/admin/org/[orgId]/page.tsx`
- [x] `/admin/store/[storeId]`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/admin/store/[storeId]/page.tsx`

## 7) Data layer, context, RBAC

- [x] Firebase client + callable wrappers
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/firebase/client.ts`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/firebase/functions.ts`
- [x] Firestore repositories/hooks
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/data/firestore.ts`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/hooks/use-auth-user.ts`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/hooks/use-org-context.ts`
- [x] Module visibility matrix
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/rbac/modules.ts`

## 8) Platform preference profile behavior (WEB vs IOS)

- [x] Preference profile key strategy + ensure callable
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/index.ts`
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/utils/preferences.ts`
- [x] Web initialization + persistence
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/components/app-shell.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/settings/page.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/data/firestore.ts`

## 9) How-To editor + PDF import

- [x] Guide list/search
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/howtos/page.tsx`
- [x] Editor with Step 1 default, add-content modal, text/photo/video blocks, reorder controls
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/howtos/[guideId]/page.tsx`
- [x] Upload media assets + attach blocks
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/data/firestore.ts`
- [x] PDF import draft generation callable pipeline
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/utils/pdf.ts`
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/index.ts`

## 10) Financial health + order suggestion MVP

- [x] Financial health computation callable
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/index.ts`
- [x] Insights + org/store display
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/insights/page.tsx`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/org/page.tsx`
- [x] Order suggestion generation + to-do creation
  - `/Users/ianjent/Desktop/InvenTracker/functions/src/index.ts`
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/app/(app)/app/orders/page.tsx`

## 11) Seed data + admin scripts

- [x] Seed script with required users/org/regions/districts/stores/items/batches/vendors/waste/how-to/preferences
  - `/Users/ianjent/Desktop/InvenTracker/scripts/seed.ts`
- [x] Admin utility scripts
  - `/Users/ianjent/Desktop/InvenTracker/firebase/set-platform-admin-claim.mjs`
  - `/Users/ianjent/Desktop/InvenTracker/firebase/remove-duplicate-orgs.mjs`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/migrate.ts`
  - `/Users/ianjent/Desktop/InvenTracker/scripts/verify-schema.ts`

## 12) Tests + validation

- [x] Functions unit tests
  - `/Users/ianjent/Desktop/InvenTracker/functions/test/order-math.test.ts`
  - `/Users/ianjent/Desktop/InvenTracker/functions/test/preferences.test.ts`
  - `/Users/ianjent/Desktop/InvenTracker/functions/test/pdf.test.ts`
  - `/Users/ianjent/Desktop/InvenTracker/functions/test/admin-safe-edit.test.ts`
- [x] Rules tests
  - `/Users/ianjent/Desktop/InvenTracker/firebase/tests/rules.test.ts`
- [x] Playwright smoke tests
  - `/Users/ianjent/Desktop/InvenTracker/apps/web/src/tests/e2e/smoke.spec.ts`
- [x] Unified validation script
  - `/Users/ianjent/Desktop/InvenTracker/package.json` (`validate`)

## Validation status in this environment

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run test:e2e`
- [x] `npm run validate` (rules tests skipped automatically when Java missing)
