# Phase 4 — Inventory reference engine

## Scope and behavior

The seven existing stock actions now share Inventory application services and Firestore repositories. Both `/api/v1/inventory/*` and compatible `/api/mobile/v1/actions/*` adapters invoke the same command boundary. Current membership, permission and organization/store scope are checked server-side, including on retries. Stock areas, aggregate quantity, batches, purchase-order progress where applicable, history, immutable stock-operation records and staged events commit together.

| Existing action | Explicit movement type | Main integrity guarantee |
| --- | --- | --- |
| Receive | `receipt` | Stock/order units agree; partial receipts close exactly; a command posts once |
| Transfer | `area_transfer` | Within-store dispatch from one stock area and receipt into the other commit together |
| Restock | `restock_reconciliation` | Preview is read-only; versioned commits require its current inventory revision |
| Waste | `discard` | Preferred/earliest-expiring allocation; multi-area failure rolls back every line |
| Cut & Portion | `portion_reclassification` | Physical quantity is conserved; package lineage and date limits are retained |
| Spot check | `count_adjustment` | Competing or stale counts fail; all selected items reconcile atomically |
| Targets | `threshold_change` | Inventory and linked store-product policy update together without moving stock |

These are the reference engine's **existing stock transactions**. Interstore shipment dispatch/in-transit/receipt, count approval sessions, receiving discrepancy sessions, restock assignment workflows, production recipes/yield-loss and compensation/reversal commands belong to Phase 6. They have not been represented as completed by this phase. Cut & Portion currently reclassifies weight into packages and does not claim recipe yield accounting. AI remains deferred.

Saved quantities must be finite, nonnegative and canonical to three decimals; an explicitly saved aggregate must equal the areas. Revisions must be safe nonnegative integers with room for the next revision. Invalid saved balances fail before mutation rather than being silently repaired. Legacy missing quantity/revision fields retain a zero baseline; historical ledgers are never rewritten.

## Read-only review and delivery

Inventory → Review stock checks stock/batch/ledger continuity in a consistent read transaction, labels missing baselines and bounded coverage, and never posts corrections. Item → Movement history adds cursor pagination across the complete store ledger, including legacy records without an explicit movement label. Each request searches 100 records; pages can contain no matches. Pages use stable document references, show item revisions, and reject continuation if the item's revision changes. This avoids pretending a bounded reconciliation sample is complete lifetime history. It is a live read review, not a retained export snapshot.

History requires inventory view plus history view/view-all, active membership and assigned-store access. Responses project before/after quantities, revision, unit, time and movement reference; they exclude actor identities, arbitrary ledger fields, costs and command results. Stock and ledger update times remain unchanged. Existing entries derive their movement label on read; new entries save the canonical label.

The enabled OIDC Scheduler worker consumes staged stock events through atomic private receipts and store invalidation cursors. Duplicate/out-of-order delivery cannot post stock or double-advance a receipt. Retry/dead-letter records are retained. The web workspace checks scoped revisions with an independent refresh fallback. Administrator → Delivery status and aggregate Cloud Logging expose worker health and retained failures. Native subscriptions, other consumers, external alerts and replay/repair tooling remain later work.

## Executable validation

Run from the repository root with project dependencies installed:

```sh
npm run engines:check
npm run stock:check
npm run orders:check
npm run pilot:check
npm run inventory:reconcile
npm run inventory:movements
npm run engines:delivery
npm run engines:health
npm run workspace:providers
npm run workspace:check
npm run validate
```

The opt-in live integration scripts require Application Default Credentials with access to the authorized test project. Never place credentials in this repository. Commands create unique fixture records and remove only those records in `finally`:

```sh
INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 \
INVENTRAKER_TEST_ORIGIN=https://intrakbckend--inventracker-f1229.us-east4.hosted.app \
node scripts/check-inventory-firestore.mjs

INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 \
INVENTRAKER_TEST_ORIGIN=https://intrakbckend--inventracker-f1229.us-east4.hosted.app \
node scripts/check-inventory-movements-http.mjs

INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 INVENTORY_WRITES_ENABLED=false \
node --import tsx scripts/check-inventory-pause-http.mts
```

The last check runs actual HTTP adapter functions locally against isolated fixture data; `tsx` is a test runner and can be installed separately. It does not pause the deployed application. All 14 write adapters must reject with 503 `inventory_read_only`; restock previews remain available and no item/ledger/outbox writes occur.

Use the full Xcode toolchain, with `DEVELOPER_DIR` pointing to its `Contents/Developer` when it is not globally selected:

```sh
npm run engines:swift
xcodebuild -project ios/InvenTracker/InvenTracker.xcodeproj \
  -scheme InvenTracker -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/inventraker-inventory-simulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/InvenTracker/InvenTracker.xcodeproj \
  -scheme InvenTracker -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/inventraker-inventory-device CODE_SIGNING_ALLOWED=NO build
```

The pinned llama runtime now contains a genuine same-version arm64 Simulator slice, preserving original device/macOS payloads. See `ios/LlamaRuntime/README.md` for provenance/reproduction. No models or AI integrations are added. The user selected simulator validation for this phase; physical-device camera, signing/distribution, VoiceOver and full release testing remain Phase 9 checks.

## Migration, telemetry and rollback

No destructive migration or ledger backfill is required. Existing mobile URLs remain live; route paths distinguish compatible mobile calls from versioned engine traffic, with command IDs and schema versions linking transaction outcomes. Explicit movement types distinguish newly recorded operations from legacy records. Delivery aggregate logs and administrator health expose the consumer path independently of stock writes.

If a release causes a stock concern, freeze writes first by setting `INVENTORY_WRITES_ENABLED` to `"false"` under runtime environment variables in `apphosting.yaml`, commit/push that configuration and wait for the App Hosting rollout to succeed. Reads and restock previews remain available; both API families reject writes. This is a deployed runtime setting, not an instantaneous remote kill switch. Do not remove ledgers, history, outbox records or consumer receipts.

Pause event delivery independently if necessary:

```sh
gcloud scheduler jobs pause inventraker-stock-events \
  --location=us-east4 --project=inventracker-f1229
```

Application rollback uses a known good Git revision, preserving its recorded transactions. Create a rollback commit on `main` without rewriting branch history:

```sh
git fetch origin
git switch -c rollback/inventory-phase-4 origin/main
git revert --no-commit PHASE_4_RELEASE_COMMIT
git commit -m 'Roll back inventory phase 4 release'
git push origin HEAD:main
```

Replace `PHASE_4_RELEASE_COMMIT` with the release hash recorded below; inspect the resulting diff before pushing. This returns to the previous compatible handlers/services and removes the new read page/flag without deleting any ledger entries. For a concern inside an earlier extraction, select the last known good App Hosting build in Firebase's rollback interface; reverting only this final release does not undo older extracted commands. Never restore an old database snapshot over newer stock transactions. Inspect discrepancies through read-only review, then apply an authorized current count when appropriate.

After recovery, restore `INVENTORY_WRITES_ENABLED=true` through a verified rollout. Resume the retained queue:

```sh
gcloud scheduler jobs resume inventraker-stock-events \
  --location=us-east4 --project=inventracker-f1229
```

## Release evidence

Final application release, deployed checks and simulator evidence are recorded here after validation. Until then, implementation is delivered and release validation is in progress.
