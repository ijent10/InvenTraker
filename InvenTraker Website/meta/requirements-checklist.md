# InvenTracker Web Rebuild – Requirements Checklist

This checklist maps requested requirements to implementation files and routes.

## 0) Monorepo structure + tooling

- [x] NPM workspaces (`apps/*`, `packages/*`, `functions`, `firebase`)
  - `./package.json`
- [x] Repo structure
  - `./apps/web`
  - `./packages/ui`
  - `./packages/shared`
  - `./functions`
  - `./scripts`
  - `./firebase`
  - `./meta/migrations`
- [x] Strict TS + lint/prettier/editor config
  - `./tsconfig.base.json`
  - `./.eslintrc.cjs`
  - `./.prettierrc`
  - `./.prettierignore`
  - `./.editorconfig`
- [x] CI workflow
  - `./.github/workflows/ci.yml`

## 1) Shared domain + validation contracts

- [x] Domain schemas + enums + contracts
  - `./packages/shared/src/enums.ts`
  - `./packages/shared/src/schemas/domain.ts`
  - `./packages/shared/src/schemas/functions.ts`
  - `./packages/shared/src/index.ts`

## 2) Firestore migrations + verification

- [x] Idempotent migration runner
  - `./scripts/migrate.ts`
- [x] Migration scripts
  - `./scripts/migrations/001_members_roles_normalization.ts`
  - `./scripts/migrations/002_regions_districts_stores_backfill.ts`
  - `./scripts/migrations/003_items_field_backfill.ts`
  - `./scripts/migrations/004_inventory_batches_store_scope.ts`
  - `./scripts/migrations/005_howto_steps_blocks_normalization.ts`
  - `./scripts/migrations/006_platform_preference_profiles_backfill.ts`
  - `./scripts/migrations/007_audit_logs_root_backfill.ts`
- [x] Migration registry docs
  - `./meta/migrations/README.md`
  - `./meta/migrations/registry.json`
- [x] Schema verification with required field checks
  - `./scripts/verify-schema.ts`

## 3) Firebase rules/indexes/storage rules

- [x] Firestore RBAC + tenant rules
  - `./firebase/firestore.rules`
- [x] Firestore indexes
  - `./firebase/firestore.indexes.json`
- [x] Storage rules
  - `./firebase/storage.rules`
- [x] Emulator config
  - `./firebase.json`

## 4) Cloud Functions backend

- [x] Callable functions implemented
  - `./functions/src/index.ts`
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
  - `./functions/src/lib/auth.ts`
- [x] PDF parser pipeline utility
  - `./functions/src/utils/pdf.ts`
- [x] Preference clone/init utility
  - `./functions/src/utils/preferences.ts`
- [x] Safe-edit whitelist utility
  - `./functions/src/utils/admin-safe-edit.ts`

## 5) UI system (iOS-style soft cards)

- [x] Token system (radius/shadow/borders)
  - `./packages/ui/src/styles/tokens.css`
  - `./apps/web/src/app/globals.css`
- [x] Reusable UI components
  - `./packages/ui/src/components/app-card.tsx`
  - `./packages/ui/src/components/metric-chip.tsx`
  - `./packages/ui/src/components/icon-tile.tsx`
  - `./packages/ui/src/components/tip-banner.tsx`
  - `./packages/ui/src/components/data-table.tsx`
  - `./packages/ui/src/components/search-input.tsx`
  - `./packages/ui/src/components/segmented-control.tsx`
  - `./packages/ui/src/components/modal.tsx`
  - `./packages/ui/src/components/tabs.tsx`
  - `./packages/ui/src/components/toast.tsx`
- [x] Semantic accent lock helper
  - `./packages/shared/src/utils/theme.ts`

## 6) Web routes/pages

### Public/Auth
- [x] `/`
  - `./apps/web/src/app/(public)/page.tsx`
- [x] `/signin`
  - `./apps/web/src/app/(auth)/signin/page.tsx`
- [x] `/signup`
  - `./apps/web/src/app/(auth)/signup/page.tsx`
- [x] `/signout`
  - `./apps/web/src/app/(auth)/signout/page.tsx`

### Signed-in app shell + nav
- [x] App shell (sidebar/topbar/mobile nav + org/store switchers + avatar)
  - `./apps/web/src/components/app-shell.tsx`
  - `./apps/web/src/app/(app)/layout.tsx`

### Core modules
- [x] `/app` dashboard
  - `./apps/web/src/app/(app)/app/page.tsx`
  - `./apps/web/src/components/dashboard-module-card.tsx`
- [x] `/app/org`
  - `./apps/web/src/app/(app)/app/org/page.tsx`
- [x] `/app/stores`
  - `./apps/web/src/app/(app)/app/stores/page.tsx`
- [x] `/app/stores/[storeId]`
  - `./apps/web/src/app/(app)/app/stores/[storeId]/page.tsx`
- [x] `/app/inventory`
  - `./apps/web/src/app/(app)/app/inventory/page.tsx`
- [x] `/app/inventory/[itemId]`
  - `./apps/web/src/app/(app)/app/inventory/[itemId]/page.tsx`
- [x] `/app/expiration`
  - `./apps/web/src/app/(app)/app/expiration/page.tsx`
- [x] `/app/waste`
  - `./apps/web/src/app/(app)/app/waste/page.tsx`
- [x] `/app/orders`
  - `./apps/web/src/app/(app)/app/orders/page.tsx`
- [x] `/app/todo`
  - `./apps/web/src/app/(app)/app/todo/page.tsx`
- [x] `/app/insights`
  - `./apps/web/src/app/(app)/app/insights/page.tsx`
- [x] `/app/production`
  - `./apps/web/src/app/(app)/app/production/page.tsx`
- [x] `/app/howtos`
  - `./apps/web/src/app/(app)/app/howtos/page.tsx`
- [x] `/app/howtos/[guideId]`
  - `./apps/web/src/app/(app)/app/howtos/[guideId]/page.tsx`
- [x] `/app/users`
  - `./apps/web/src/app/(app)/app/users/page.tsx`
- [x] `/app/settings`
  - `./apps/web/src/app/(app)/app/settings/page.tsx`

### Admin
- [x] `/admin`
  - `./apps/web/src/app/(app)/admin/page.tsx`
- [x] `/admin/org/[orgId]`
  - `./apps/web/src/app/(app)/admin/org/[orgId]/page.tsx`
- [x] `/admin/store/[storeId]`
  - `./apps/web/src/app/(app)/admin/store/[storeId]/page.tsx`

## 7) Data layer, context, RBAC

- [x] Firebase client + callable wrappers
  - `./apps/web/src/lib/firebase/client.ts`
  - `./apps/web/src/lib/firebase/functions.ts`
- [x] Firestore repositories/hooks
  - `./apps/web/src/lib/data/firestore.ts`
  - `./apps/web/src/hooks/use-auth-user.ts`
  - `./apps/web/src/hooks/use-org-context.ts`
- [x] Module visibility matrix
  - `./apps/web/src/lib/rbac/modules.ts`

## 8) Platform preference profile behavior (WEB vs IOS)

- [x] Preference profile key strategy + ensure callable
  - `./functions/src/index.ts`
  - `./functions/src/utils/preferences.ts`
- [x] Web initialization + persistence
  - `./apps/web/src/components/app-shell.tsx`
  - `./apps/web/src/app/(app)/app/settings/page.tsx`
  - `./apps/web/src/lib/data/firestore.ts`

## 9) How-To editor + PDF import

- [x] Guide list/search
  - `./apps/web/src/app/(app)/app/howtos/page.tsx`
- [x] Editor with Step 1 default, add-content modal, text/photo/video blocks, reorder controls
  - `./apps/web/src/app/(app)/app/howtos/[guideId]/page.tsx`
- [x] Upload media assets + attach blocks
  - `./apps/web/src/lib/data/firestore.ts`
- [x] PDF import draft generation callable pipeline
  - `./functions/src/utils/pdf.ts`
  - `./functions/src/index.ts`

## 10) Financial health + order suggestion MVP

- [x] Financial health computation callable
  - `./functions/src/index.ts`
- [x] Insights + org/store display
  - `./apps/web/src/app/(app)/app/insights/page.tsx`
  - `./apps/web/src/app/(app)/app/org/page.tsx`
- [x] Order suggestion generation + to-do creation
  - `./functions/src/index.ts`
  - `./apps/web/src/app/(app)/app/orders/page.tsx`

## 11) Seed data + admin scripts

- [x] Seed script with required users/org/regions/districts/stores/items/batches/vendors/waste/how-to/preferences
  - `./scripts/seed.ts`
- [x] Admin utility scripts
  - `./firebase/set-platform-admin-claim.mjs`
  - `./firebase/remove-duplicate-orgs.mjs`
  - `./scripts/migrate.ts`
  - `./scripts/verify-schema.ts`

## 12) Tests + validation

- [x] Functions unit tests
  - `./functions/test/order-math.test.ts`
  - `./functions/test/preferences.test.ts`
  - `./functions/test/pdf.test.ts`
  - `./functions/test/admin-safe-edit.test.ts`
- [x] Rules tests
  - `./firebase/tests/rules.test.ts`
- [x] Playwright smoke tests
  - `./apps/web/src/tests/e2e/smoke.spec.ts`
- [x] Unified validation script
  - `./package.json` (`validate`)

## Validation status in this environment

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run test:e2e`
- [x] `npm run validate` (rules tests skipped automatically when Java missing)
