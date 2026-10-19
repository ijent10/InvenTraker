# Phase 5 — Workspace Engine

## Implemented behavior

The existing web editor and new native editor share the versioned layout contract, server-owned widget catalog, deterministic geometry, user/organization/device persistence, and scoped operational summaries. AI integration remains deferred.

| Capability | Web | Native |
| --- | --- | --- |
| Entry | Home / Personal Settings | Home → Customize / Account → Customize your home screen |
| Layout changes | Add/remove, drag, corner resize, snapping/reflow, undo/reset/cancel | Add/remove, hold-and-drag with placeholder, corner resize, snapping/reflow, undo/reset/cancel |
| Shapes | Home-wide shapes and compatible stored overrides | Home-wide and per-widget shapes |
| Content | Summary, deterministic priorities, pinned content with expiry | Same modes and expiry rules |
| Access | Catalog and data filtered by current permissions | Server-filtered catalog/data; unavailable instances remain removable |
| Device layouts | Phone/tablet/desktop | Phone and regular-width iPad; compact iPad uses phone layout |
| Persistence | Expected revisions, explicit conflicts, scoped drafts | Same, with restore/discard and retained failed-save edits |
| Refresh | Visibility-aware stock revision polling and full-refresh fallback | Visible Home revision checks every 15 seconds plus a 60-second full-refresh fallback |

The new read-only `/api/v1/workspace/catalog?device=…` supplies permitted definitions, defaults, additive legacy migration and a deterministic seed from another saved device. Seeding never changes another device's layout or deletes `dashboardWidgetIds`. The clients initialize an absent layout with expected revision zero; a concurrent saved layout wins over the seed. User edits commit with Done. Existing unfinished drafts are offered for recovery before initialization. Layout changes never move stock or call AI.

Native work runs against `https://www.inventraker.com`. The previous `inventracker-f1229.web.app` address still exposed older mobile endpoints but returned 404 for the new workspace catalog. The canonical production address was verified against actual live responses and used for the native client, matching its existing README.

## Validation

- Shared TypeScript invariants for packing, collision/bounds, snapping, migration, revisions and provider permissions/freshness.
- Actual native models and store checked against 120 generated cross-platform geometry cases, including negative coordinates and saved rows beyond 500. Squared snap distances are quantized on both platforms so floating-point ties pick the same size.
- Native tests cover malformed/duplicate geometry, corrupted draft bounds, scoped draft recovery, cancel/undo, gesture commit/resize, failed-save retention, initial-save races, explicit remote/local conflict choices, store changes, permission revocation and candidate expiry.
- Live HTTP checks on isolated, self-cleaning records cover catalog permissions, read-only seeding, unknown legacy IDs, owner/geometry validation, device independence, concurrent creation/update conflicts, inactive memberships, organization/store isolation and unchanged legacy preferences.
- Native models decoded actual catalog/device-seed/widget-summary/candidate responses from the canonical production API.
- Full web lint/typecheck/production builds and generic iOS device/arm64 Simulator builds passed during implementation. Final release verification is recorded below.

Run repository checks:

```sh
npm run workspace:check
npm run workspace:providers
npm run workspace:swift
npm run validate
```

Use a full Xcode toolchain for `workspace:swift`, setting `DEVELOPER_DIR` to its `Contents/Developer` if it is not globally selected. The current machine has Xcode under `/Users/ian/Downloads/Xcode.app`.

The live suite requires authorized Application Default Credentials kept outside the repository:

```sh
INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 \
INVENTRAKER_TEST_ORIGIN=https://intrakbckend--inventracker-f1229.us-east4.hosted.app \
node scripts/check-workspace-http.mjs
```

Regenerate the shared fixture with `node --import tsx scripts/generate-workspace-fixture.mts` using a separately installed `tsx` runner. The committed fixture is checked by the native suite; it contains no operational customer data. `scripts/check-native-workspace-wire.swift` can decode an explicitly captured `{ catalog, facts }` response file without retaining authentication tokens.

## Rollback

Set `NEXT_PUBLIC_WORKSPACE_LAYOUT_V2=false` at build time to restore the previous web renderer. For native, add Boolean `WorkspaceLayoutV2=false` in `ios/InvenTracker/InvenTracker/Info.plist` and rebuild. The native standard Home is retained; an unavailable catalog also offers it explicitly. The native rollback flag disables entry into the new editor, including the account shortcut. Saved layouts, drafts, legacy preferences and stock records remain intact.

Initial layout creation and changes to presentation are reversible personal preferences. No inventory, order, receipt, waste, portion, batch, ledger, outbox or employee records are migrated by this phase.

## Remaining verification

The iPhone Simulator app is built and installed. Interactive visual/gesture verification is pending because the Mac locked during testing; the app-control tool requires a manual unlock. No completed native drag, resize or cloud-save UI check is claimed yet. Phone/iPad visual fit, keyboard/VoiceOver interaction, hardware haptics and final device release checks must be recorded before claiming full Phase 5 validation. Broad offline application startup remains release-validation work; Phase 5 preserves layout edits after a failed save and offers recovery when the workspace reconnects.
