-- Remove the superseded 11-argument create_invoice.
--
-- 0011 added p_patient_id / p_patient_name / p_patient_uhid to support
-- manual-only invoices, which created a 14-argument overload alongside the
-- original rather than replacing it (Postgres treats a changed signature as a
-- new function). The only caller, src/lib/billing.js, has sent all fourteen
-- named arguments ever since, so the old one has been unreachable from the
-- app since that day.
--
-- Two reasons not to leave it sitting there:
--
--   * It carries the pre-0011 validation rule — it rejects any invoice with
--     no source visit, admission or sale, so a walk-in charge cannot be
--     billed through it. Anything that did reach it would fail in a way that
--     makes no sense against the current UI.
--   * Two overloads of the same name is a live ambiguity risk in PostgREST:
--     an argument set that matches both resolves to "could not choose the
--     best candidate function" rather than to either one.
--
-- Dropping only the 11-argument signature. The 14-argument version the app
-- actually calls is untouched.

drop function if exists public.create_invoice(
  text[], text[], text[], jsonb, numeric, numeric, numeric, text, numeric, text, jsonb
);
