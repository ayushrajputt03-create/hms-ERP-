-- Partial / multi-mode payment collection + credit notes for the billing module.
--
-- create_invoice (0007-era) always marks a new invoice fully 'paid' (or fully
-- 'pending' for insurance), with no way to record money coming in over time —
-- e.g. a patient paying ₹2,000 cash today against a ₹5,000 bill and the rest
-- next week. This adds that missing piece the same way the rest of the app
-- extends a JSONB document: a `payments` array lives inside the invoice's own
-- `documents` row, appended to under a row lock so two front-desk clicks can
-- never double-count a payment.
--
-- Status machine on invoices, driven purely by paidAmount vs total:
--   paidAmount == 0            -> 'pending'          (unchanged from create_invoice)
--   0 < paidAmount < total     -> 'partially_paid'
--   paidAmount >= total        -> 'paid'
-- 'cancelled' is untouched by payment recording (checked explicitly below).
--
-- Credit notes correct a finalized invoice without editing its locked totals:
-- they only apply to invoices that have received at least one payment, and
-- lower the effective balance due (creditedAmount), which can drop a 'paid'
-- invoice back to 'partially_paid' if the credit exceeds what's still owed
-- against the reduced total.

create or replace function public.record_payment(
  p_invoice_id text,
  p_amount numeric,
  p_mode text,
  p_reference text default null,
  p_date bigint default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid  text := public.hms_current_facility_id();
  v_role text := public.hms_current_role();
  v_inv  public.documents%rowtype;
  v_data jsonb;
  v_payments jsonb;
  v_paid numeric;
  v_total numeric;
  v_credited numeric;
  v_balance numeric;
  v_status text;
  v_payment jsonb;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_fid is null then raise exception 'Not a facility member'; end if;
  if v_role not in ('billing_staff','facility_admin','super_admin') then
    raise exception 'Role % is not permitted to record payments', coalesce(v_role,'none');
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_mode not in ('cash','upi','card','insurance','bank_transfer') then
    raise exception 'Invalid payment mode %', p_mode;
  end if;

  select * into v_inv from public.documents
   where path = 'facilities/'||v_fid||'/billing/'||p_invoice_id for update;
  if not found then raise exception 'Invoice % not found', p_invoice_id; end if;

  v_data := v_inv.data;
  if (v_data->>'paymentStatus') = 'cancelled' then
    raise exception 'Cannot record a payment against a cancelled invoice';
  end if;

  v_total := coalesce((v_data->>'total')::numeric, (v_data->>'grandTotal')::numeric, 0);
  v_credited := coalesce((v_data->>'creditedAmount')::numeric, 0);
  v_paid := coalesce((v_data->>'paidAmount')::numeric, 0);

  if v_paid + p_amount > (v_total - v_credited) + 0.01 then
    raise exception 'Payment of % exceeds balance due of %', p_amount, (v_total - v_credited - v_paid);
  end if;

  v_payment := jsonb_build_object(
    'id', 'pay'||v_now::text||floor(random()*1000)::text,
    'amount', p_amount,
    'mode', p_mode,
    'referenceNumber', nullif(btrim(coalesce(p_reference, '')), ''),
    'paymentDate', coalesce(p_date, v_now),
    'receivedByRole', v_role,
    'recordedAt', v_now
  );
  v_payments := coalesce(v_data->'payments', '[]'::jsonb) || jsonb_build_array(v_payment);
  v_paid := v_paid + p_amount;
  v_balance := (v_total - v_credited) - v_paid;
  v_status := case
    when v_paid <= 0 then 'pending'
    when v_balance > 0.01 then 'partially_paid'
    else 'paid'
  end;

  update public.documents
     set data = data || jsonb_build_object(
           'payments', v_payments,
           'paidAmount', v_paid,
           'balanceDue', greatest(v_balance, 0),
           'paymentStatus', v_status,
           'updatedAt', v_now
         ),
         updated_at = now()
   where path = v_inv.path;

  return v_payment;
end; $function$;

create or replace function public.add_credit_note(
  p_invoice_id text,
  p_reason text,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid  text := public.hms_current_facility_id();
  v_role text := public.hms_current_role();
  v_inv  public.documents%rowtype;
  v_data jsonb;
  v_notes jsonb;
  v_note jsonb;
  v_total numeric;
  v_paid numeric;
  v_credited numeric;
  v_balance numeric;
  v_status text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_fid is null then raise exception 'Not a facility member'; end if;
  if v_role not in ('billing_staff','facility_admin','super_admin') then
    raise exception 'Role % is not permitted to issue credit notes', coalesce(v_role,'none');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A credit note requires a reason';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Credit note amount must be greater than zero';
  end if;

  select * into v_inv from public.documents
   where path = 'facilities/'||v_fid||'/billing/'||p_invoice_id for update;
  if not found then raise exception 'Invoice % not found', p_invoice_id; end if;

  v_data := v_inv.data;
  -- Credit notes correct an already-finalized bill, not one still awaiting
  -- its first rupee — that's what editing the draft/regenerating is for.
  if coalesce((v_data->>'paidAmount')::numeric, 0) <= 0 then
    raise exception 'Credit notes can only be issued against an invoice that has received a payment';
  end if;
  if (v_data->>'paymentStatus') = 'cancelled' then
    raise exception 'Cannot issue a credit note against a cancelled invoice';
  end if;

  v_total := coalesce((v_data->>'total')::numeric, (v_data->>'grandTotal')::numeric, 0);
  v_paid := coalesce((v_data->>'paidAmount')::numeric, 0);
  v_credited := coalesce((v_data->>'creditedAmount')::numeric, 0);

  if p_amount > (v_total - v_credited) + 0.01 then
    raise exception 'Credit note of % exceeds the invoice''s remaining total of %', p_amount, (v_total - v_credited);
  end if;

  v_note := jsonb_build_object(
    'id', 'cn'||v_now::text||floor(random()*1000)::text,
    'reason', btrim(p_reason),
    'amount', p_amount,
    'issuedByRole', v_role,
    'issuedAt', v_now
  );
  v_notes := coalesce(v_data->'creditNotes', '[]'::jsonb) || jsonb_build_array(v_note);
  v_credited := v_credited + p_amount;
  v_balance := greatest((v_total - v_credited) - v_paid, 0);
  v_status := case
    when v_paid <= 0 then 'pending'
    when v_balance > 0.01 then 'partially_paid'
    else 'paid'
  end;

  update public.documents
     set data = data || jsonb_build_object(
           'creditNotes', v_notes,
           'creditedAmount', v_credited,
           'balanceDue', v_balance,
           'paymentStatus', v_status,
           'updatedAt', v_now
         ),
         updated_at = now()
   where path = v_inv.path;

  return v_note;
end; $function$;

revoke all on function public.record_payment(text, numeric, text, text, bigint) from public;
revoke all on function public.add_credit_note(text, text, numeric) from public;
grant execute on function public.record_payment(text, numeric, text, text, bigint) to authenticated;
grant execute on function public.add_credit_note(text, text, numeric) to authenticated;
