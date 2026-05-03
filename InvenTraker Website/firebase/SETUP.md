# Firebase Setup (InvenTracker)

This workspace supports Firebase Auth + Firestore for the website and the separated iOS app.

Use these exact values:
- Firebase project: `InvenTracker`
- Project ID: `inventracker-f1229`
- iOS bundle ID (from app): `SimpyComplicated.InstaTracker`

## 1. Add iOS app in Firebase Console
1. Open Firebase Console.
2. Select project `InvenTracker` (`inventracker-f1229`).
3. Click **Project Settings** (gear icon).
4. In **Your apps**, click **Add app** and choose **iOS**.
5. Enter bundle ID: `SimpyComplicated.InstaTracker`.
6. App nickname can be `InvenTracker iOS`.
7. Download `GoogleService-Info.plist`.

## 2. Add plist to Xcode
1. Drag `GoogleService-Info.plist` into the iOS app repo's `InstaTracker/` folder in Xcode.
2. In the add dialog:
   - Check **Copy items if needed**.
   - Ensure target **InvenTraker** is checked.
3. Confirm the file appears in Build Phases -> **Copy Bundle Resources**.

## 3. Add Firebase packages in Xcode
1. In Xcode, open **File -> Add Packages...**
2. Use URL:
   - `https://github.com/firebase/firebase-ios-sdk`
3. Add these products to target `InvenTraker`:
   - `FirebaseAuth`
   - `FirebaseFirestore`
   - `FirebaseFirestoreSwift`
   - `FirebaseCore`

## 4. Enable Authentication providers
1. Firebase Console -> **Build -> Authentication -> Sign-in method**.
2. Enable:
   - **Email/Password**
   - **Apple** (recommended next)
3. For now, Email/Password is enough to validate current in-app account flow.

## 5. Create Firestore database
1. Firebase Console -> **Build -> Firestore Database**.
2. Create database in **Production mode** (recommended).
3. Pick nearest region.

## 6. Deploy security rules and indexes
Rules and indexes are in:
- `./firebase/firestore.rules`
- `./firebase/firestore.indexes.json`

Deploy with Firebase CLI (no global install required):
1. From project root:
   - `cd "/path/to/InvenTraker Website"`
2. Login:
   - `npx --yes firebase-tools login`
3. Select project once:
   - `npx --yes firebase-tools use inventracker-f1229`
4. Deploy:
   - `npx --yes firebase-tools deploy --only firestore:rules,firestore:indexes`

## 6b. Set your personal platform admin claim
This enables your "only me" admin capabilities on web.

1. In Firebase Console:
   - Project Settings -> Service accounts -> Generate new private key
   - Save JSON somewhere safe (outside source control)
2. Install local admin helper deps:
   - `cd ./firebase`
   - `npm install`
3. Export credentials path in terminal:
   - `export GOOGLE_APPLICATION_CREDENTIALS=\"/absolute/path/to/service-account.json\"`
4. Set claim by email:
   - `npm run set-admin-claim -- --email your-email@example.com`
5. Sign out and sign back in on web so token claims refresh.

To remove admin claim later:
- `npm run set-admin-claim -- --email your-email@example.com --remove`

## 7. Optional: remove duplicate organizations by name
Use this only if you intentionally want to delete duplicate org records (for example duplicate "Fresh Market" orgs).

1. Dry run first:
   - `cd ./firebase`
   - `npm run dedupe-orgs -- --name "Fresh Market"`
2. If output looks correct, apply deletion:
   - `npm run dedupe-orgs -- --name "Fresh Market" --apply`

The script keeps the org with the highest inventory item count and removes duplicate org(s) with less inventory.

## 8. Verify from app
1. Build and run app.
2. Open account icon in bottom bar (left of chop icon).
3. Create account or sign in.
4. Create organization.
5. Generate one order / do one spot check / receive / waste.
6. In Firestore, verify documents under:
   - `organizations/{orgId}/actions`

## Notes
- If `GoogleService-Info.plist` is missing, app stays in local fallback mode (no crash).
- Once plist + packages are present, Firebase activates automatically at launch.
