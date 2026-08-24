-- Phase 8 (Insurance, Discounts, and Refunds) — server-enforced security rules.
--
-- Emulates table constraints and transitions directly inside the JSONB document store.
-- 

-- 1. Update insurance claim status
create or replace function public.update_insurance_claim_status(
  p_path text,
  p_status text,
  p_approved_amount numeric default null,
  p_remarks text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.documents%rowtype;
  v_data jsonb;
  v_claim jsonb;
  v_role text := public.hms_current_role();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into v_row from public.documents where path = p_path;
  if not found then
    raise exception 'INVOICE_NOT_FOUND: %', p_path;
  end if;

  -- Security check: tenant isolation
  if not public.is_facility_member(v_row.facility_id) then
    raise exception 'NOT_FACILITY_MEMBER';
  end if;

  -- Security check: authorized billing roles
  if v_role not in ('billing_staff', 'facility_admin', 'super_admin') then
    raise exception 'Role % not permitted to update insurance claims', coalesce(v_role, 'none');
  end if;

  v_data := v_row.data;
  v_claim := coalesce(v_data->'insuranceClaim', '{}'::jsonb);
  v_claim := jsonb_set(v_claim, '{status}', to_jsonb(p_status));
  
  if p_approved_amount is not null then
    v_claim := jsonb_set(v_claim, '{approvedAmount}', to_jsonb(p_approved_amount));
  end if;
  if p_remarks is not null then
    v_claim := jsonb_set(v_claim, '{notes}', to_jsonb(p_remarks));
  end if;

  v_data := jsonb_set(v_data, '{insuranceClaim}', v_claim);
  v_data := jsonb_set(v_data, '{updatedAt}', to_jsonb(v_now));

  update public.documents set data = v_data where path = p_path;
  return v_data;
end;
$$;

revoke all on function public.update_insurance_claim_status(text,text,numeric,text) from public;
grant execute on function public.update_insurance_claim_status(text,text,numeric,text) to authenticated;

-- 2. Apply invoice discount (Admin / Super Admin only)
create or replace function public.apply_invoice_discount(
  p_path text,
  p_discount numeric,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.documents%rowtype;
  v_data jsonb;
  v_role text := public.hms_current_role();
  v_subtotal numeric;
  v_gst numeric;
  v_total numeric;
  v_paid numeric;
  v_credited numeric;
  v_balance numeric;
  v_uid text := auth.uid()::text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into v_row from public.documents where path = p_path;
  if not found then
    raise exception 'INVOICE_NOT_FOUND: %', p_path;
  end if;

  -- Security check: tenant isolation
  if not public.is_facility_member(v_row.facility_id) then
    raise exception 'NOT_FACILITY_MEMBER';
  end if;

  -- Security check: Admin only
  if v_role not in ('facility_admin', 'super_admin') then
    raise exception 'Role % not permitted to apply discounts', coalesce(v_role, 'none');
  end if;
  if p_discount < 0 then
    raise exception 'Discount cannot be negative';
  end if;

  v_data := v_row.data;
  v_subtotal := coalesce((v_data->>'subtotal')::numeric, 0);
  v_gst := coalesce((v_data->>'gstAmount')::numeric, 0);
  v_paid := coalesce((v_data->>'paidAmount')::numeric, 0);
  v_credited := coalesce((v_data->>'creditedAmount')::numeric, 0);

  v_total := greatest(0, v_subtotal + v_gst - p_discount);
  if v_total < v_paid then
    raise exception 'Discount of % reduces total below already paid amount of %', p_discount, v_paid;
  end if;

  v_balance := v_total - v_credited - v_paid;

  v_data := jsonb_set(v_data, '{discount}', to_jsonb(p_discount));
  v_data := jsonb_set(v_data, '{discountReason}', to_jsonb(p_reason));
  v_data := jsonb_set(v_data, '{discountApprovedBy}', to_jsonb(v_uid));
  v_data := jsonb_set(v_data, '{total}', to_jsonb(v_total));
  v_data := jsonb_set(v_data, '{grandTotal}', to_jsonb(v_total));
  v_data := jsonb_set(v_data, '{balanceDue}', to_jsonb(greatest(0, v_balance)));
  v_data := jsonb_set(v_data, '{updatedAt}', to_jsonb(v_now));

  if v_balance <= 0.01 then
    v_data := jsonb_set(v_data, '{paymentStatus}', to_jsonb('paid'::text));
  end if;

  update public.documents set data = v_data where path = p_path;
  return v_data;
end;
$$;

revoke all on function public.apply_invoice_discount(text,numeric,text) from public;
grant execute on function public.apply_invoice_discount(text,numeric,text) to authenticated;

-- 3. Process refund (Admin / Super Admin only)
create or replace function public.process_refund(
  p_path text,
  p_amount numeric,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.documents%rowtype;
  v_data jsonb;
  v_role text := public.hms_current_role();
  v_paid numeric;
  v_refunded numeric;
  v_refund jsonb;
  v_uid text := auth.uid()::text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into v_row from public.documents where path = p_path;
  if not found then
    raise exception 'INVOICE_NOT_FOUND: %', p_path;
  end if;

  -- Security check: tenant isolation
  if not public.is_facility_member(v_row.facility_id) then
    raise exception 'NOT_FACILITY_MEMBER';
  end if;

  -- Security check: Admin only
  if v_role not in ('facility_admin', 'super_admin') then
    raise exception 'Role % not permitted to process refunds', coalesce(v_role, 'none');
  end if;
  if p_amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  v_data := v_row.data;
  v_paid := coalesce((v_data->>'paidAmount')::numeric, 0);
  v_refunded := coalesce((v_data->>'refundedAmount')::numeric, 0);

  if v_refunded + p_amount > v_paid + 0.01 then
    raise exception 'Refund amount of % exceeds refundable balance of %', p_amount, (v_paid - v_refunded);
  end if;

  v_refund := jsonb_build_object(
    'id', 'ref' || v_now::text || floor(random()*1000)::text,
    'amount', p_amount,
    'reason', p_reason,
    'processedAt', v_now,
    'processedBy', v_uid
  );

  v_data := jsonb_set(
    v_data,
    '{refunds}',
    coalesce(v_data->'refunds', '[]'::jsonb) || jsonb_build_array(v_refund)
  );
  v_data := jsonb_set(v_data, '{refundedAmount}', to_jsonb(v_refunded + p_amount));
  v_data := jsonb_set(v_data, '{updatedAt}', to_jsonb(v_now));

  if v_refunded + p_amount >= v_paid - 0.01 then
    v_data := jsonb_set(v_data, '{paymentStatus}', to_jsonb('refunded'::text));
  else
    v_data := jsonb_set(v_data, '{paymentStatus}', to_jsonb('partially_refunded'::text));
  end if;

  update public.documents set data = v_data where path = p_path;
  return v_data;
end;
$$;

revoke all on function public.process_refund(text,numeric,text) from public;
grant execute on function public.process_refund(text,numeric,text) to authenticated;
