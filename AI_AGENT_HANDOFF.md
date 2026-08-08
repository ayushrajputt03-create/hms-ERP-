# AI Agent Handoff Guide — HMS ERP

> Read this **before** writing any code or SQL. It exists to stop you from
> building on assumptions that are false in this repo. The single most
> important rule is in section 1. If you read nothing else, read that.

---

## 0. Project identity

- **Product:** HMS ERP — Hospital & Clinic Management System (multi-tenant).
- **Stack:** React 18 + Vite SPA, `react-router-dom` v6, `lucide-react` icons.
- **Backend:** Supabase (Postgres + Supabase Auth + Realtime + Storage).
  - Project ref: `namttfhimfcxkyihepui` (region `ap-south-1`).
- **Deploy:** Vercel (see section 6 — there are **two** projects, this bites people).
- **Repo:** `https://github.com/ayushrajputt03-create/hms-ERP-.git`
- Also read `CLAUDE.md` at repo root — it's the human-facing companion to this file.

---

## 1. ⚠️ THE ONE THING YOU MUST INTERNALIZE: architecture ≠ the phase specs

The feature/phase specs written for this project (Phase 3–8: Billing, IPD,
Pharmacy, Lab, Reports, Insurance/Refunds) are written **as if the database were
a normal relational schema** — they reference tables like `opd_visits`,
`invoices`, `lab_orders`, `test_catalog`, `insurance_claims`, `refunds`,
`medicine_batches`, numbered migrations (`0005_lab_diagnostics.sql`,
`0006_reports.sql`, `0007_insurance_refunds_discounts.sql`), views (`v_*`), and
functions (`create_invoice_from_opd_visit`, `update_insurance_claim_status`,
`apply_invoice_discount`, `process_refund`).

**Almost none of that exists.** As verified against the live database this
session, the **only table in the `public` schema is `documents`.** There are
**no** relational feature tables, **no** `v_*` reporting views, and the numbered
migrations `0005/0006/0007` described in the specs were **never written or
applied**. The specs are aspirational/templated and were repeatedly disconnected
from reality.

### What actually exists: a JSONB "document store"

This app emulates the old Firebase Realtime Database tree inside **one Postgres
table**, so module code keeps a path-based API.

- Table `public.documents`:
  - `path` (PK) — full path, e.g. `facilities/{fid}/patients/{pid}`
  - `collection` — parent path, e.g. `facilities/{fid}/patients`
  - `facility_id` — tenant id (for RLS)
  - `data` (jsonb) — the actual record
  - timestamps
- All reads/writes go through **`src/lib/db.js`** helpers:
  `getDocument`, `setDocument`, `addDocument`, `updateDocument`,
  `deleteDocument`, `queryDocuments`, `subscribeToDocument`,
  `subscribeToCollection`, `incrementCounter`, `adjustValue`.
- Nested sub-path writes (e.g. `.../wards/{w}/beds/{b}`) merge into the nearest
  ancestor record's JSONB — see `updateDocument`.

### Your first action on ANY new feature request

Before writing a line, **verify the DB reality** rather than trusting the spec:

```sql
-- via the Supabase MCP (execute_sql) or the SQL editor
select table_name from information_schema.tables where table_schema='public';
select proname from pg_proc where pronamespace = 'public'::regnamespace;
select policyname, cmd, qual from pg_policies where tablename='documents';
```

If the spec says "table X already exists / migration N applied" and the query
says otherwise, **stop and reconcile it with the human before building.** This
has been the #1 source of wasted work here. Also check `src/modules/<name>/` —
the module the spec asks you to "build" is very often **already built** on the
document store (Lab, Reports, TPA tracker all already existed when their specs
arrived).

### How to add server-enforced logic on the JSONB store

You don't need relational tables to get server-side guarantees. Pattern:
write a `SECURITY DEFINER` Postgres function that operates on `documents` rows,
enforces the rule, and manually checks `is_facility_member(facility_id)` (because
`SECURITY DEFINER` bypasses RLS). See the working example added this session:
`supabase/migrations/0005_lab_status_machine.sql` (`update_lab_order_status`).

---

## 2. Functions & RLS that DO exist

Postgres functions actually present (all `SECURITY DEFINER`, callable by
`authenticated`):

| Function | Purpose |
|---|---|
| `is_facility_member(p_fid text)` | tenant check — is caller staff/owner of facility |
| `hms_current_facility_id()`, `hms_current_role()` | caller context helpers |
| `increment_counter(p_path, p_field)` | atomic counter (UHIDs, tokens) |
| `adjust_value(p_path, p_delta)` | atomic numeric adjust (stock qty) |
| `create_invoice(...)` | race-safe invoicing; flips `billed` on OPD/IPD/pharmacy sources |
| `admit_patient(...)`, `discharge_patient(...)`, `administer_dose(...)` | IPD |
| `dispense_medicine(...)` | pharmacy |
| `update_lab_order_status(p_path, p_next_status, p_results, p_report_file_url)` | **added this session** — forward-only lab status machine + "ready needs results/file" |

RLS on `documents` (policy `documents_rw`, SELECT/ALL):
`(collection = 'facilityIndex') OR is_facility_member(facility_id)`.
i.e. `facilityIndex` is readable by any authenticated user; everything else is
gated by facility membership. **There is currently no per-row, per-user
restriction** (e.g. "a doctor sees only their own orders") at the RLS level —
that is enforced only in the UI/query today. Changing the shared `documents`
policy affects **every** module, so treat it as high-risk on production.

---

## 3. Data model (JSONB paths)

```
facilities/{facilityId}/
  config                      profile, enabledModules, subscription, tpaInsuranceEnabled
  staff/{staffId}             role, department
  patients/{patientId}        demographics, uhid, allergies
  opdVisits/{visitId}         appointment/consultation, status, doctorId, consultationFee, billed
  ipd/admissions/{id}, ipd/wards/{id}(.beds)
  pharmacy/medicines, pharmacy/batches, pharmacy/sales
  lab/tests/{id}              test catalog
  lab/orders/{id}             { status, statusTimestamps, items[], patientName, orderedBy, billed }
  billing/{invoiceId}         { type:'invoice', items[], grandTotal, paidAmount, insuranceClaim{}, ... }
  auditLog/{logId}            immutable
facilityIndex/{facilityId}    denormalized; ownerUid; world-readable to authenticated
superAdmin/{uid}
```

Note: facilities were created with `facilityId == owner's auth uid` (so
`facilityIndex` row has `ownerUid == facility_id == id`).

RBAC is UI-level in `src/lib/rbac.js` (`can(role, module, action)`), enforced via
`Sidebar` (`visibleModules()`) and `ModuleGate`. 8 roles: super_admin,
facility_admin, doctor, nurse, receptionist, pharmacist, lab_tech, billing_staff.

---

## 4. What's actually built

Modules live in `src/modules/<name>/`, all on the document store:
- **auth** (login/register/facility setup), **dashboard**, **patients**, **opd**
  (appointment calendar, queue, consultation, Rx), **ipd** (bed board, admit,
  MAR, discharge), **pharmacy** (catalog, batches, dispense, sales),
  **lab** (LabPage/OrdersTab/ResultModal/CatalogTab), **billing**
  (BillBuilder, InvoiceView, CollectionReport, **TpaTracker**),
  **reports** (ReportsPage: OPD/IPD/Revenue/Pharmacy tabs + CSV export),
  **admin** (facility settings, audit log), **super-admin**.

Key shared libs: `src/lib/db.js`, `auth.js`, `supabase.js`, `rbac.js`,
`billing.js` (pending-item sources + `create_invoice` wrapper), `pdf.js`,
`utils.js`, `constants.js`.

---

## 5. Auth & the "login doesn't work" / "Supabase not configured" trap

- `src/lib/supabase.js`: `isSupabaseConfigured = !!(VITE_SUPABASE_URL &&
  VITE_SUPABASE_ANON_KEY)`. If **either** env var is missing **at build time**,
  Vite inlines nothing, the client is `null`, and the app shows **"Supabase not
  configured"** — login/reset then throw that. This is a **build/env** problem,
  not a code bug.
- Auth itself works (Supabase Auth, email/password + Google). `invalid_credentials`
  from the token endpoint for an existing confirmed account means **wrong
  password**, not a config issue.
- Debugging recipe used this session: check the live JS bundle for the inlined
  key (`sb_publishable_...`) and the project ref; check `auth.users` confirmed
  state (avoid selecting password columns — the tooling blocks it); read Supabase
  **auth logs** for the real `error_code` and `referer`.

---

## 6. ⚠️ Two Vercel projects (very easy to deploy to the wrong one)

Both auto-deploy from the same GitHub repo:

| Vercel project | Domains | Notes |
|---|---|---|
| `hms-erp-one` | `hms-erp-one-ten.vercel.app` | env vars set here; CLI was linked here |
| `hms-erp` | `hms-erp-one.vercel.app`, `hms-erp-ayushrajputo3.vercel.app` | **the one the owner actually uses**; behind Vercel SSO on the `-ayushrajputo3` domain |

Consequence seen this session: a `vercel --prod` CLI deploy + env vars went to
`hms-erp-one`, while the owner's real domain is on `hms-erp`. If the owner reports
"my changes/config aren't showing," **confirm which project the target domain
belongs to** (`vercel projects ls`) and that **that** project has the
`VITE_SUPABASE_*` env vars. Recommend consolidating to one project when possible.
A `git push` triggers both to redeploy.

---

## 7. Design system

Navy palette (migrated from the old teal this session), defined as CSS variables
in `src/app.css` (`:root`) and mirrored in `super-admin.css` + `pdf.js`:
`#021024` `#052659` `#5483B3` `#7DA0CA` `#C1E8FF`. Dense, operational UI; no
decorative gradients; A4-safe print; `lucide-react` icons only. Reuse existing
component classes (`stat-card`, `queue-card`, `data-table`, `badge`, `tabs`,
`modal`, `claim-card`, etc.) rather than inventing new ones.

---

## 8. Current working-tree state (uncommitted — verify before continuing)

Last commit: `8d5c9d9` (navy theme + modern calendar + realtime optimization).
Uncommitted at handoff:
- `supabase/migrations/0005_lab_status_machine.sql` — **new, already applied &
  tested** on the live DB (`update_lab_order_status`). Not yet committed.
- `src/modules/reports/ReportsPage.jsx` — **in-progress** Phase 7 role-gating
  edits (doctor sees only own numbers; billing_staff limited to revenue/dues; IPD
  card gated by module). **Not build-verified yet** — run `npm run build` and
  finish/verify before relying on it.

Always run `git status` and `npm run build` first to see reality.

---

## 9. Outstanding work (with the correct, JSONB-consistent approach)

**Phase 6 — Lab (mostly done):** server status machine done & tested. Remaining:
add a `db.js` `updateLabOrderStatus()` wrapper calling the RPC; rewire
`OrdersTab`/`ResultModal` to it; add imaging **file upload** (Supabase Storage)
+ dynamic result fields; add `labSource` to `billing.js` pending items and remove
the duplicate order-time billing write in `OrdersTab`. Notifications: **no
send infrastructure exists** (`api/` is empty) — either queue a notification
record now and integrate a provider later, or build the provider explicitly.

**Phase 7 — Reports (in progress):** finish the `ReportsPage` role-gating above;
optionally add admin "today" metric cards + 7-day trend to the dashboard, and
daily-collection-by-payment-mode / stock-valuation / lab-volume reports — all
derived **client-side** from `documents` (there are no `v_*` views).

**Phase 8 — Insurance/Discounts/Refunds (not started):** the spec's
`insurance_claims`/`refunds` tables and `update_insurance_claim_status` /
`apply_invoice_discount` / `process_refund` functions **do not exist**. A TPA
tracker already exists (`src/modules/billing/TpaTracker.jsx`) reading
`invoice.insuranceClaim` **JSONB** (there is no `invoices.insurance_claim`
column to "drop" — that breaking-change instruction is moot here). To honor the
spec's server-enforced guarantees, add `SECURITY DEFINER` functions on the
document store (mirroring the lab status machine): enforce claim status
transitions, set discount `approvedBy` from `auth.uid()` server-side, and an
insert-only refund ledger validating amount ≤ remaining refundable. Enforce the
facility_admin/super_admin-only rules inside the functions (via `hms_current_role()`),
not just the UI.

**General:** treat every incoming phase spec as *intent*, not fact. Verify tables/
functions exist; if not, either add them as JSONB-store functions/migrations or
flag the gap. Keep everything tenant-scoped via `facility_id` + `is_facility_member`.

---

## 10. Commands & env

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build      # run before claiming any fix is complete
npm.cmd run preview
```

Env (`.env.local`, never commit real values): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (publishable key), `VITE_APP_ENV`,
`VITE_SUPER_ADMIN_EMAIL`. The service-role key must never reach the client.
Path aliases: `@/`, `@lib/`, `@modules/`, `@components/`, `@hooks/`, `@contexts/`.
```
