# InvenTracker

Clean-slate rebuild for the InvenTracker web platform.

This repo is now organized as a single root-level Next.js + Firebase project. The old mobile code is archived at `legacy/mobile-app-reference` for future reference only. The new website does not import it or depend on it.

## Current Foundation

- Dashboard-first operating workspace
- Inventory, orders, products, vendors, and settings sections
- Platform administrator section for legal content, feature requests, FAQs, organizations, stores, users, and subscriptions
- Firebase client wiring ready for a new backend
- Firestore and Storage rules reset for the rebuilt data model
- Reset script for Firestore, Auth, and Storage
- Firestore-first schema contract for org data, employee records, inventory, orders, history, health checks, assistant knowledge, themes, dashboard preferences, and platform administration

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Firebase Environment

Create `.env.local` from `.env.example` and fill in the Firebase web config for the new project/database.

```bash
cp .env.example .env.local
```

Set `NEXT_PUBLIC_DEFAULT_ORG_ID` to the organization id the web portal should use by default. Local demo mode uses `demo-org`.

This workspace is configured for the `inventracker-f1229` Firebase project in `.firebaserc`. The browser web config belongs in `.env.local`, which is ignored by git.

Before real browser writes can pass Firestore rules, seed an owner member record for the signed-in Firebase Auth user:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
npm run firebase:seed -- --owner-email=owner@example.com --owner-name="Owner Name" --org-id=demo-org
```

You can also provide `--owner-uid=<firebase-auth-uid>` instead of `--owner-email`.

### Sign-In And Permission Testing

To test synced saves and role-based access quickly, seed the permission lab users:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
npm run firebase:seed-test-users -- --org-id=demo-org
```

The default seeded password is `InvenTracker123!`. To use a different temporary password:

```bash
INVENTRACKER_TEST_USER_PASSWORD="temporary-test-password" \
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
npm run firebase:seed-test-users -- --org-id=demo-org
```

Seeded users:

- `owner@inventracker.test` has full organization access.
- `manager@inventracker.test` can manage inventory, orders, health checks, vendors, employees view, and store history.
- `inventory@inventracker.test` can edit inventory and complete health checks, but cannot approve orders.
- `orders@inventracker.test` can create order drafts, but cannot submit approvals.
- `viewer@inventracker.test` is read-only across common operating pages.
- `suspended@inventracker.test` should be blocked from permission-gated access.

After seeding, open `/signin`, sign in as each user, and try direct URLs such as `/employees`, `/orders`, `/inventory`, `/organization`, and `/administrator`. The administrator permission lab lives at `/administrator/access-lab` and shows exactly which sidebar tabs and permissions the current signed-in user has.

### Public Signup Flow

Returning users use `/signin` with email and password only. New organizations use the guided create-account flow at `/signin?create=1`.

The signup flow collects:

- owner first name and last name
- owner email and password
- organization name
- store locations and store nicknames
- employee count plus initial employee names and emails
- a plain-language business description

The app recommends a future Starter, Growth, or Scale fit from the signup details, but billing plans are paused until the apps are finished. The current signup button creates a trial workspace immediately through Firebase Admin: Firebase Auth user, organization document, owner member record, stores, employee invite records, and a `platformSubscriptions/{orgId}` record with Stripe linking marked pending.

When Stripe prices are ready, `/api/stripe/signup-checkout` can send the same signup payload through Stripe Checkout. `/api/signup/finalize` activates the same Firebase workspace after Stripe returns a completed checkout session, so the billing path and the no-payment trial path use the same database shape.

Stripe environment values:

```bash
STRIPE_SECRET_KEY=
STRIPE_DEFAULT_PRICE_ID=
STRIPE_STARTER_PRICE_ID=
STRIPE_GROWTH_PRICE_ID=
STRIPE_SCALE_PRICE_ID=
STRIPE_SIGNUP_TRIAL_DAYS=14
SIGNUP_TRIAL_ENABLED=true
```

If plan-specific price ids are blank, signup checkout falls back to `STRIPE_DEFAULT_PRICE_ID`.
If all price ids are blank, the public create-account flow still works through `/api/signup/trial` and optionally creates a Stripe customer when `STRIPE_SECRET_KEY` is configured.

### Platform Administrator

The bootstrap platform administrator email is `ianjjent@icloud.com`. Do not store the account password in the repo or in command history.

There are two supported ways to activate platform administrator access:

1. Sign in to the web app with that Firebase Auth account and open `/administrator`. The page refreshes `platformAdmins/{uid}` automatically for the approved bootstrap email. Firestore rules allow only that bootstrap email to create its own platform admin record.
2. Use Firebase Admin credentials to seed the account and set a custom claim:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
npm run firebase:seed-admin -- --email=ianjjent@icloud.com
```

If the Auth user does not exist yet, create it in Firebase Authentication first, or provide a one-time `INVENTRACKER_PLATFORM_ADMIN_PASSWORD` environment variable for the seed script.

Deploy rules when you are ready:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project inventracker-f1229
```

## Database-First Model

The rebuilt platform should treat Firestore as the source of truth for anything that must survive across browsers, devices, or future mobile apps.

Canonical paths live in `src/lib/firestore-schema.ts`:

- `orgs/{orgId}` for organization identity, defaults, permission policies, and business settings. New org documents should include `ownerId: <uid>` so the first owner can create their member record.
- `orgs/{orgId}/members/{uid}` for employee profile, job title, store/department scope, and permissions.
- `users/{uid}/preferences/workspace` for personal themes, saved themes, density, and dashboard layout.
- `platformAdmins/{uid}` for global InvenTracker administrators.
- `platformLegal/{documentId}`, `platformFeatureRequests/{requestId}`, `platformFaqs/{faqId}`, and `platformSubscriptions/{subscriptionId}` for platform-owned legal, support, roadmap, and subscription operations.
- `centralCatalog/{centralProductId}` for every approved scanned product across organizations. This is the global product identity layer: name, SKU/barcode, nutrition candidates, average price, average expiration, average case quantity, images, and learned product facts. Browser users can read it, but only platform admins can write it directly.
- `platformProductApprovals/{requestId}` for product candidates submitted by organizations. Normal signed-in users can create and update their own pending requests. Platform admins approve candidates into `centralCatalog`.
- `assistantProductMemory/{memoryId}` for private server-only product fact notes the assistant can use to answer faster and search more broadly. Firestore client rules deny direct access, so normal users and browser code do not read or write these records.
- `orgs/{orgId}/stores/{storeId}`, `departments`, `categories`, `displays`, and `settings` for org/store structure.
- `orgs/{orgId}/products/{productId}` for organization-approved references to `centralCatalog`, with organization categories, notes, defaults, and operating overrides.
- `orgs/{orgId}/inventory/{itemId}` for current store stock snapshots, and `orgs/{orgId}/stores/{storeId}/productDetails/{storeProductId}` for store-local vendor, price, expiration, case quantity, location, and store notes.
- `orgs/{orgId}/orders`, `vendors`, `healthChecks`, `healthCheckResponses`, `history`, `waste`, `restocks`, `receiving`, `portions`, and `sales` for operations.
- `orgs/{orgId}/insights`, `aiProductKnowledge`, `aiLearningRuns`, `aiSources`, and `aiPendingAutofills` for the assistant layer.

The assistant privacy contract is defined in `src/lib/ai/privacy.ts`. The assistant can use product, inventory, organization, store, import, training, store-resource, and approved web verification data. It must not receive names, emails, phone numbers, employee IDs, authentication data, who completed a task, who approved a change, or private billing identifiers.

The current rebuild still keeps demo fallback records in `src/lib/demo-data.ts` so the UI can run without Firebase credentials. Production features should read and write the Firestore paths above first, with demo data only as local preview fallback.

Personal theme choices, saved themes, and dashboard layout are already synced to `users/{uid}/preferences/workspace` when Firebase Auth is available.
Personal tip visibility is also synced there as `showTips`, so users can hide or show helper summaries across devices.

## Reset Firebase

This deletes Firestore collections, Firebase Auth users, and Storage objects for the configured Firebase project.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
FIREBASE_STORAGE_BUCKET=your-project.appspot.com \
npm run firebase:reset -- --yes
```

The script refuses to run without `--yes`.

## Product Direction

The first rebuilt product surface is inventory/order management. The future assistant layer can attach to the product catalog and order generation workflow once the new data model is stable.
