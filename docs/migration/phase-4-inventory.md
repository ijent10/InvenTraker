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

If a release causes a stock concern, freeze stock writes first by setting `INVENTORY_WRITES_ENABLED` to `"false"` under runtime environment variables in `apphosting.yaml`, commit/push that configuration and wait for the App Hosting rollout to succeed. Reads and restock previews remain available; both API families reject writes. This is a deployed runtime setting, not an instantaneous remote kill switch. Do not remove ledgers, history, outbox records or consumer receipts.

Pause event delivery independently if necessary:

```sh
gcloud scheduler jobs pause inventraker-stock-events \
  --location=us-east4 --project=inventracker-f1229
```

Application rollback uses a known good Git revision, preserving its recorded transactions. Create a rollback commit on `main` without rewriting branch history:

```sh
git fetch origin --tags
git switch -c rollback/inventory-phase-4 origin/main
git revert --no-commit c0bd707..inventory-phase4-2026-10-18
git commit -m 'Roll back inventory phase 4 release'
git push origin HEAD:main
```

The tagged release includes the two application commits and their final verification documentation. Reverting the range newest-first avoids leaving the follow-up documentation against a removed read-page implementation. Inspect the resulting diff before pushing. This returns to the previous compatible handlers/services and removes the new read page/flag without deleting any ledger entries. For a concern inside an earlier extraction, select the last known good App Hosting build in Firebase's rollback interface; reverting this final release does not undo older extracted commands. Never restore an old database snapshot over newer stock transactions. Inspect discrepancies through read-only review, then apply an authorized current count when the saved balance itself is valid. Malformed saved balances need a controlled administrative repair; no automated ledger repair is claimed.

After recovery, restore `INVENTORY_WRITES_ENABLED=true` through a verified rollout. Resume the retained queue:

```sh
gcloud scheduler jobs resume inventraker-stock-events \
  --location=us-east4 --project=inventracker-f1229
```

## Release evidence

Application commits: `7a1adc75784ff7c2792df4cc4bd352fccfb3b046` (movement history, write pause, saved-state validation and simulator support), followed by `d23eef7` (history-navigation permission parity and count label). The first App Hosting build/rollout was `2026-10-18-001`, READY/SUCCEEDED. The final application build/rollout `2026-10-18-002` is READY/SUCCEEDED at `d23eef7e9f941283f6e6cda0268380c0d76ff6a9`. Tag `inventory-phase4-2026-10-18` also includes this final documentation; later docs-only rollout does not change application behavior. Phase 4 is complete for the scope stated above.

Passed on October 18, 2026:

- All seven command/domain suites and actual Swift model fixtures; stock/order/pilot, reconciliation, movement, event-delivery/health and workspace checks.
- Lint without warnings/errors, TypeScript and the full Next.js production build, including the final navigation correction. Fresh isolated dependencies were used because some existing local dependency files timed out during reads; repository dependencies were not replaced.
- Deployed seven-action Firestore suite: API parity, retries/conflicts, receiving once, competing mutations, stock/batch/order/output/target consistency and complete rollback when staged event creation fails. New ledgers retained the canonical movement type.
- Deployed movement HTTP suite: 1,005 records over 11 pages, legacy/new labels, no truncation/duplicates, stale cursor conflicts, both history permission variants, inactive states, organization/store restrictions, private-field exclusion and unchanged item/ledger update times. The ephemeral organization and Auth identity were removed.
- Actual local HTTP pause check: all 14 write adapters rejected with 503; preview returned 200; inventory update time and ledger/outbox absence were verified.
- Xcode 27.0 generic iOS device and arm64 iPhone 17/iOS 27 Simulator Debug builds. Simulator install/launch and test-owner sign-in succeeded, loading the assigned store, inventory and existing item detail/nutrition screen. The user authorized simulator use in place of the unavailable phone. Native UI posting was not independently exercised; all stock HTTP paths and Swift contracts were checked. Physical camera/VoiceOver/signing and comprehensive offline/conflict UX remain Phase 9 release checks.
- Browser navigation through stock review findings, item link and movement history, plus fresh-review and empty/end states. No real-store stock was changed. An untouched native UI fixture and its two batches were removed; no native fixture operation was posted.

Logs/screenshots for this session are under `/tmp/inventraker-phase4-*`; the reproducible checks above are retained in the repository. Earlier worker/OIDC, delivery receipt/monitor and client-rule-denial evidence remains in `docs/architecture/engine-contracts.md`. Native event subscriptions and expanded Phase 6 workflows are outside this phase's existing command boundary.


Final operations check: Scheduler remained ENABLED with a successful automatic attempt and fresh `workspace-stock-v1` heartbeat, with no retries/dead letters reported in that run. Both native API origins returned the expected unauthenticated API response. Fixture cleanup was confirmed. The working tree retains only the pre-existing untracked `.firebase/` directory after the release documentation commit.
