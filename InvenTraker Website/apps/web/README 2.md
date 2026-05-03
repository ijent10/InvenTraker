# InvenTraker Web

Website + dashboard for InvenTraker, backed by the same Firebase project and account model as the iOS app.

## Includes
- Marketing landing page
- Pricing page
- Email/password sign up + login
- Protected dashboard with:
  - organization selection + persistence
  - role/permission-aware module visibility
  - user/role/department management
  - department-scoped inventory table
  - bulk import tools
  - how-to PDF ingest + editable export workflow
  - insights + recommendations
  - feature request intake + queue
  - platform admin panel (if enabled)

## 1) Install
From the `InvenTraker Website` workspace root:

```bash
npm install
```

## 2) Configure env
Create the web env file:

```bash
cp apps/web/.env.example apps/web/.env.local
```
Fill in missing values from your project settings.  
Set `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS` to a comma-separated list (for example, your own email) to enable admin UI visibility.

## 3) Run locally
```bash
npm run dev
```
Open http://localhost:3000

## 4) Deploy (Vercel recommended)
- Import this workspace and use `apps/web` as the web app root if your host asks for one
- Add the same `NEXT_PUBLIC_FIREBASE_*` env vars
- Deploy

## Notes on seamless app integration
- Uses the same account users and org/membership collections as iOS.
- Dashboard reads:
  - `organizations/{orgId}`
  - `organizations/{orgId}/members/{uid}`
  - `organizations/{orgId}/actions`
- Uses role + permission override fields to gate modules and actions.
- Platform admin server access is controlled by the `platform_admin` custom auth claim in security rules.
