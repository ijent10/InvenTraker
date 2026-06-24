# InvenTracker

Clean-slate rebuild for the InvenTracker web platform.

This repo is now organized as a single root-level Next.js + Firebase project. The old mobile code is archived at `legacy/mobile-app-reference` for future reference only. The new website does not import it or depend on it.

## Current Foundation

- Dashboard-first operating workspace
- Inventory, orders, products, vendors, and settings sections
- Firebase client wiring ready for a new backend
- Firestore and Storage rules reset for the rebuilt data model
- Reset script for Firestore, Auth, and Storage

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

## Reset Firebase

This deletes Firestore collections, Firebase Auth users, and Storage objects for the configured Firebase project.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
FIREBASE_STORAGE_BUCKET=your-project.appspot.com \
npm run firebase:reset -- --yes
```

The script refuses to run without `--yes`.

## Product Direction

The first rebuilt product surface is inventory/order management. The future AI layer can attach to the product catalog and order generation workflow once the new data model is stable.
