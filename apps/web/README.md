# InvenTracker Web

Website + dashboard for InvenTracker, backed by the same project and account model as the iOS app.

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
```bash
cd web
npm install
```

## 2) Configure env
Create `.env.local` in `web/`:
```bash
cp .env.example .env.local
```
Fill in missing values from your project settings.  
Set `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS` to a comma-separated list (for example, your own email) to enable admin UI visibility.

## 3) Run locally
```bash
npm run dev
```
Open http://localhost:3000

## 4) Deploy (Vercel recommended)
- Import `web/` as a project
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
