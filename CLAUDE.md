# CLAUDE.md

## Project Identity

- Project: HMS ERP — Hospital & Clinic Management System
- GitHub remote: https://github.com/ayushrajputt03-create/hms-ERP-.git
- App type: React 18 + Vite SPA
- Backend/services: Firebase Auth, Firebase Realtime Database, Firebase Storage
- Deployment: Vercel
- Parent company: NXT Eleveta Media

## Commands

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

## Environment Variables

Create `.env.local` from `.env.example`.

Frontend (VITE_*): Firebase config, app env, super admin email.
Server (api/): Firebase service account, Resend API key, cron secret.

Never commit `.env`, service account JSON, or API keys.

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

- Theme: Medical teal `#0F766E` primary, `#0284C7` accent, dark mode via CSS variables
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
