# InvenTraker Website + Backend

Production-facing web app and Firebase backend for InvenTraker. The iOS app can remain separate and communicate with this workspace through Firebase Auth, Firestore, Storage, and Cloud Functions.

## Workspace layout

- `apps/web` – Next.js web app
- `packages/ui` – reusable UI system + design tokens
- `packages/shared` – shared zod schemas, enums, contracts
- `functions` – Firebase Cloud Functions (TypeScript)
- `scripts` – migration, seed, schema verify, admin utilities
- `firebase` – Firestore/Storage rules + indexes + rules tests
- `meta/migrations` – migration registry and docs

## Prerequisites

- Node.js 20+
- npm 10+
- Firebase CLI (`firebase-tools`)
- Playwright browser binaries (installed via `npx playwright install chromium`)
- Java runtime (required for Firestore emulator/rules tests)

## Environment setup

1. Web env file:

```bash
cp ./apps/web/.env.example ./apps/web/.env.local
```

2. Fill Firebase public values in `./apps/web/.env.local`.

3. Set Admin SDK credentials for scripts/functions tooling:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
```

## Install

```bash
cd "/path/to/InvenTraker Website"
npm install
```

## Run locally

Start web app:

```bash
npm run dev
```

Run emulators:

```bash
npm run emulators
```

## Database migrations + schema verification

```bash
npm run migrate
npm run verify:schema
```

## Seed test data

```bash
npm run seed
```

Creates:
- Organization: `The Fresh Market (Test)`
- Regions: 2
- Districts: 3
- Stores: 3
- Items: 25 (mixed `each`/`lbs`)
- Inventory batches, waste records, vendors, orders/todos, production + how-to sample docs

## Seeded test accounts

Password for all test accounts:

```text
InvenTracker!123
```

Accounts:
- `owner@test.com` (Owner)
- `manager@test.com` (Manager, assigned store-1)
- `staff@test.com` (Staff, assigned store-1)
- `admin@test.com` (Platform Admin + Owner)

## Grant platform admin to your account

```bash
npm run grant-admin -- --email ianjjent@icloud.com
```

If you also want guaranteed Owner access to a specific org:

```bash
npm run grant-admin -- --email ianjjent@icloud.com --owner --org <orgId>
```

Then sign out and sign in again so refreshed auth claims are applied.

## Validation

```bash
npm run validate
```

`validate` runs:
- lint
- typecheck
- unit tests
- Firestore rules tests (auto-skips when Java is unavailable)
- Playwright smoke tests

## Deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions
```
