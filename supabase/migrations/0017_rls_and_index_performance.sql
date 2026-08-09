-- Performance: stop RLS doing per-row work, and index the lookups it depends on.
--
-- ---------------------------------------------------------------------------
-- 1. The RLS policy was re-running a subquery for every row
-- ---------------------------------------------------------------------------
-- `documents_rw` filtered with `is_facility_member(facility_id)`. Because that
-- takes the row's own facility_id as an argument, Postgres cannot hoist it —
-- it is called once per candidate row, and each call ran its own lookup
-- against `documents`. Measured on the live database: returning 2 patient rows
-- touched 80 shared buffers.
--
-- Everything in this store belongs to exactly one facility, and the caller
-- belongs to exactly one facility, so membership does not actually need to be
-- asked per row — it needs to be asked once and then compared. Wrapping the
-- lookup in a scalar subquery makes Postgres evaluate it a single time as an
-- InitPlan, leaving a plain text equality per row.
--
-- Semantics are unchanged. is_facility_member(fid) was true when
--   fid = auth.uid()  OR  a staff record exists at facilities/{fid}/staff/{uid}
-- and hms_current_facility_id() returns precisely the facility_id of that
-- staff record, so the two branches below cover the same ground.

drop policy if exists documents_rw on public.documents;
create policy documents_rw on public.documents
  for all to authenticated
  using (
    collection = 'facilityIndex'
    or facility_id = (select public.hms_current_facility_id())
    or facility_id = (select (auth.uid())::text)
  )
  with check (
    (collection = 'facilityIndex' and path = 'facilityIndex/' || (select (auth.uid())::text))
    or facility_id = (select public.hms_current_facility_id())
    or facility_id = (select (auth.uid())::text)
  );

-- Same treatment for the two role-gated policies: hms_current_role() does not
-- depend on the row at all, so there is no reason to ask it per row.

drop policy if exists documents_invoice_write_roles on public.documents;
create policy documents_invoice_write_roles on public.documents
  for all to authenticated
  using (true)
  with check (
    coalesce(data ->> 'type', '') <> 'invoice'
    or (select public.hms_current_role()) = any (array['billing_staff','facility_admin','super_admin'])
  );

drop policy if exists pharmacy_write_roles on public.documents;
create policy pharmacy_write_roles on public.documents
  for all to authenticated
  using (true)
  with check (
    collection not like 'facilities/%/pharmacy/%'
    or (select public.hms_current_role()) = any (array['pharmacist','facility_admin','super_admin'])
  );

-- ---------------------------------------------------------------------------
-- 2. The staff lookup behind every one of those calls was a sequential scan
-- ---------------------------------------------------------------------------
-- hms_current_facility_id() and hms_current_role() both searched with
--   path like 'facilities/%/staff/' || auth.uid()
-- The wildcard sits in the middle of the pattern, so the primary key on `path`
-- cannot be used and Postgres scanned the whole table — confirmed by EXPLAIN.
-- At 43 rows that is invisible; at half a million it is a full scan on every
-- permission check.
--
-- A staff path is always facilities/{fid}/staff/{uid}, so the uid is simply
-- the fourth segment. Indexing that segment turns the scan into an index
-- lookup. The index is partial so it only covers staff records.

create index if not exists documents_staff_uid_idx
  on public.documents (split_part(path, '/', 4))
  where collection like 'facilities/%/staff';

create or replace function public.hms_current_facility_id()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select facility_id from public.documents
   where collection like 'facilities/%/staff'
     and split_part(path, '/', 4) = (auth.uid())::text
   limit 1;
$function$;

create or replace function public.hms_current_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select data ->> 'role' from public.documents
   where collection like 'facilities/%/staff'
     and split_part(path, '/', 4) = (auth.uid())::text
   limit 1;
$function$;

-- is_facility_member already looked up by exact path (a primary key hit), so
-- it is left alone. It is no longer on the per-row hot path either way.

-- ---------------------------------------------------------------------------
-- 3. Index the per-patient lookups the billing screen makes
-- ---------------------------------------------------------------------------
-- getPendingItems() runs three queryDocuments calls per patient — OPD visits,
-- IPD admissions and pharmacy sales, each filtered on data->>'patientId'.
-- Without an index each one scans its whole collection.

create index if not exists documents_collection_patient_idx
  on public.documents (collection, (data ->> 'patientId'));

-- Invoices are listed newest-first on every billing screen.
create index if not exists documents_invoice_date_idx
  on public.documents (collection, ((data ->> 'invoiceDate')::bigint) desc)
  where collection like 'facilities/%/billing';

analyze public.documents;
