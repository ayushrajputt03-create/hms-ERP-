# CLAUDE.md

## Project Identity

- Project: HMS ERP — Hospital & Clinic Management System
- GitHub remote: https://github.com/ayushrajputt03-create/hms-ERP-.git
- App type: React 18 + Vite SPA
- Backend/services: Supabase (Postgres + Supabase Auth + Realtime). Project ref: `namttfhimfcxkyihepui` (region ap-south-1)
- Deployment: Vercel
- Parent company: NXT Eleveta Media

## Data Layer (Supabase)

Migrated off Firebase. Data lives in a single Postgres table `public.documents` that
emulates the old Firebase RTDB tree so module code keeps its path-based API:

- Each record = one row keyed by full path, e.g. `facilities/{fid}/patients/{pid}`.
- Columns: `path` (PK), `collection` (parent path), `facility_id`, `data` (jsonb), timestamps.
- `src/lib/db.js` implements the path helpers (get/set/add/update/delete/query/subscribe*)
  on this table + Supabase Realtime. Nested sub-path writes (e.g. `.../wards/{w}/beds/{b}`)
  merge into the nearest ancestor record's JSONB.
- Atomic ops are Postgres RPCs: `increment_counter(path, field)` and `adjust_value(path, delta)`.
- Tenant isolation is enforced by RLS (`is_facility_member`): a user only sees rows whose
  `facility_id` is a facility they are staff of (or own). `facilityIndex` is world-readable to
  authenticated users. Role-level checks remain in `src/lib/rbac.js` (UI) as before.
- Auth: `src/lib/auth.js` wraps Supabase Auth (email/password + Google). Set-up flow expects
  "Confirm email" to be OFF in the Supabase dashboard for instant register -> setup -> dashboard.

Data migration from a Firebase export: `scripts/migrate-firebase-to-supabase.mjs`.

## Commands

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

## Environment Variables

Create `.env.local` from `.env.example`.

Frontend (VITE_*): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key), `VITE_APP_ENV`, `VITE_SUPER_ADMIN_EMAIL`.

Never commit `.env`, the service_role key, or API keys.

## Architecture

Modular structure — each module in `src/modules/{name}/`. No file should exceed 500 lines.

- `src/lib/` — Firebase init, RTDB helpers, RBAC, audit, utilities
- `src/hooks/` — React hooks (useAuth, useFacility, usePermission, Realtime DB hooks)
- `src/contexts/` — AuthContext, FacilityContext
- `src/components/` — Shared UI (AppShell, Sidebar, Header, Modal, DataTable, etc.)
- `src/modules/auth/` — Login, Register, Facility Setup Wizard
- `src/modules/dashboard/` — Role-aware dashboards
- `src/modules/staff/` — Staff management, roles, departments
- `src/modules/admin/` — Facility settings, user management, tariff master, audit log
- `src/modules/super-admin/` — Platform owner console
- `src/modules/patients/` — Patient registration, profiles, timeline
- `src/modules/opd/` — Appointments, queue, consultation
- `src/modules/ipd/` — Beds, wards, admissions, discharge
- `src/modules/pharmacy/` — Medicine master, stock, dispensing
- `src/modules/lab/` — Tests, samples, results, reports
- `src/modules/billing/` — Invoices, payments, GST, TPA
- `src/modules/reports/` — Analytics dashboards, exports
- `src/routes.jsx` — React Router v6 with lazy loading

## RTDB Data Model

```
facilities/{facilityId}/
  config                     — facility profile, modules, subscription
  staff/{staffId}            — role, department, schedule
  patients/{patientId}       — demographics, UHID, allergies, conditions
  opdVisits/{visitId}        — appointment/consultation, vitals, prescription
  doctorSchedules/{id}       — per-doctor availability
  prescriptionTemplates/{id} — saved Rx templates per doctor
  tariffMaster/{id}          — consultation/procedure charges
  counters/{counterId}       — auto-increment for UHID, tokens
  ipd/{child}
  pharmacy/{child}
  lab/{child}
  billing/{child}            — line items from OPD/IPD/pharmacy/lab
  auditLog/{logId}           — immutable, create-only
facilityIndex/{facilityId}   — denormalized for cross-tenant queries
superAdmin/{uid}
```

## RBAC

9 roles: super_admin, facility_admin, doctor, nurse, receptionist, pharmacist, lab_tech, billing_staff, patient (Phase 2).

Permission checks: `can(role, module, action)` in `src/lib/rbac.js`. Enforced at both UI (Sidebar filtering, ModuleGate) and Firestore rules level.

## Design Rules

- Theme: Northstar navy — `#052659` primary, `#5483B3`/`#7DA0CA` accents, `#021024` sidebar, `#C1E8FF` pale highlight; dark mode via CSS variables. (Matches the school ERP palette.)
- Dense, operational UI — no decorative gradients
- Print documents: A4-safe, hide app UI
- Use lucide-react icons exclusively
- Patient photos: rectangular/passport style

## Development Rules

- Before editing a module, search existing patterns in nearby files
- All database writes go through `src/lib/db.js` helpers (auto-audit)
- No hardcoded credentials — all secrets in env vars
- Audit trail on all clinical and financial actions
- Run `npm.cmd run build` before claiming a fix is complete
- Use path aliases: `@/`, `@lib/`, `@modules/`, `@components/`, `@hooks/`, `@contexts/`
