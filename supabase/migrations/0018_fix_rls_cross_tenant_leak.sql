-- SECURITY: close a cross-tenant read leak in the documents RLS policies.
--
-- ---------------------------------------------------------------------------
-- What was wrong
-- ---------------------------------------------------------------------------
-- `documents_invoice_write_roles` and `pharmacy_write_roles` exist to stop the
-- wrong role WRITING invoices or pharmacy records. Both were created as
-- PERMISSIVE policies `FOR ALL` with `USING (true)`, putting the role check in
-- WITH CHECK and leaving USING wide open.
--
-- Postgres combines permissive policies with OR. So the effective read rule on
-- `documents` was:
--
--   documents_rw.using  OR  true  OR  true    ==   true
--
-- The tenant policy was being OR-ed away. Every authenticated user could read
-- every row of every facility.
--
-- Confirmed on the live database before this migration: a session whose JWT
-- subject was a random UUID belonging to no facility at all could still read
-- all 51 rows, and the leak persisted with `documents_rw` forced to
-- `USING (false)` — proving the tenant policy was not the source.
--
-- This was not caused by the performance work in 0017; both policies carried
-- `USING (true)` from the day they were written. 0017 only rewrote their
-- WITH CHECK expressions.
--
-- ---------------------------------------------------------------------------
-- The fix
-- ---------------------------------------------------------------------------
-- A policy that exists to take permission away must be RESTRICTIVE, not
-- permissive. Restrictive policies are combined with AND, so these now narrow
-- what `documents_rw` allows instead of overriding it:
--
--   documents_rw.using  AND  true  AND  true
--
-- Their write rules are unchanged — only the way they combine changes.

drop policy if exists documents_invoice_write_roles on public.documents;
create policy documents_invoice_write_roles on public.documents
  as restrictive
  for all to authenticated
  using (true)
  with check (
    coalesce(data ->> 'type', '') <> 'invoice'
    or (select public.hms_current_role()) = any (array['billing_staff','facility_admin','super_admin'])
  );

drop policy if exists pharmacy_write_roles on public.documents;
create policy pharmacy_write_roles on public.documents
  as restrictive
  for all to authenticated
  using (true)
  with check (
    collection not like 'facilities/%/pharmacy/%'
    or (select public.hms_current_role()) = any (array['pharmacist','facility_admin','super_admin'])
  );
