-- create_invoice rejected an invoice with zero source ids ("At least one
-- billable item is required"), even when the caller supplied manual line
-- items (e.g. a walk-in "injection charge" with no OPD visit or IPD stay
-- behind it). The RPC always stored p_line_items regardless — the guard was
-- just checking the wrong thing (source ids instead of what actually gets
-- billed). Swap it to require at least one line item, which covers both
-- manual-only and pulled-from-visit invoices.

create or replace function public.create_invoice(
  p_visit_ids text[], p_admission_ids text[], p_sale_ids text[], p_line_items jsonb,
  p_subtotal numeric, p_gst_amount numeric, p_discount numeric, p_discount_reason text,
  p_total numeric, p_payment_mode text, p_insurance jsonb default null,
  p_patient_id text default null, p_patient_name text default null, p_patient_uhid text default null
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid  text := public.hms_current_facility_id();
  v_role text := public.hms_current_role();
  v_on   text;
  v_id   text; v_no bigint; v_prefix text;
  v_now  bigint := (extract(epoch from now()) * 1000)::bigint;
  v_status text;
  v_rec  public.documents%rowtype;
  v_first public.documents%rowtype;
  v_x    text;
begin
  if v_fid is null then raise exception 'Not a facility member'; end if;
  if v_role not in ('billing_staff','facility_admin','super_admin') then
    raise exception 'Role % is not permitted to create invoices', coalesce(v_role,'none');
  end if;

  select data->'modules'->>'billing' into v_on
    from public.documents where path = 'facilities/'||v_fid||'/config';
  if v_on is distinct from 'true' then
    raise exception 'Billing module is not enabled for this facility';
  end if;

  if coalesce(p_discount,0) > 0 and (p_discount_reason is null or btrim(p_discount_reason) = '') then
    raise exception 'A discount requires a reason';
  end if;

  if coalesce(jsonb_array_length(p_line_items), 0) = 0 then
    raise exception 'At least one billable item is required';
  end if;

  if p_visit_ids is not null then
    foreach v_x in array p_visit_ids loop
      select * into v_rec from public.documents where path = 'facilities/'||v_fid||'/opdVisits/'||v_x for update;
      if not found then raise exception 'OPD visit % not found', v_x; end if;
      if (v_rec.data->>'billed') = 'true' then raise exception 'OPD visit % already billed', v_x; end if;
      if v_first.path is null then v_first := v_rec; end if;
    end loop;
  end if;
  if p_admission_ids is not null then
    foreach v_x in array p_admission_ids loop
      select * into v_rec from public.documents where path = 'facilities/'||v_fid||'/ipd/admissions/'||v_x for update;
      if not found then raise exception 'Admission % not found', v_x; end if;
      if (v_rec.data->>'status') <> 'discharged' then raise exception 'Admission % is not discharged yet', v_x; end if;
      if (v_rec.data->>'billed') = 'true' then raise exception 'Admission % already billed', v_x; end if;
      if v_first.path is null then v_first := v_rec; end if;
    end loop;
  end if;
  if p_sale_ids is not null then
    foreach v_x in array p_sale_ids loop
      select * into v_rec from public.documents where path = 'facilities/'||v_fid||'/pharmacy/sales/'||v_x for update;
      if not found then raise exception 'Pharmacy sale % not found', v_x; end if;
      if (v_rec.data->>'billed') = 'true' then raise exception 'Pharmacy sale % already billed', v_x; end if;
      if v_first.path is null then v_first := v_rec; end if;
    end loop;
  end if;

  insert into public.documents (path, collection, facility_id, data)
    values ('facilities/'||v_fid||'/counters/invoice', 'facilities/'||v_fid||'/counters', v_fid, jsonb_build_object('value', 1))
  on conflict (path) do update
    set data = documents.data || jsonb_build_object('value', coalesce((documents.data->>'value')::bigint, 0) + 1)
  returning (data->>'value')::bigint into v_no;

  select coalesce(data->>'invoicePrefix','INV') into v_prefix from public.documents where path = 'facilities/'||v_fid||'/config';
  v_id := 'inv'||v_now::text||floor(random()*1000)::text;
  v_status := case when p_payment_mode = 'insurance' then 'pending' else 'paid' end;

  -- A manual-only invoice has no source visit/admission/sale, so patient
  -- identity has to come off the invoice request itself, not v_first — the
  -- caller (BillBuilder) already knows the selected patient. Fall back to
  -- v_first for backward compatibility when it exists.
  insert into public.documents (path, collection, facility_id, data) values (
    'facilities/'||v_fid||'/billing/'||v_id, 'facilities/'||v_fid||'/billing', v_fid,
    jsonb_build_object(
      'type','invoice',
      'invoiceNumber', v_prefix||'-'||to_char(now(),'YYYY')||'-'||lpad(v_no::text,5,'0'),
      'patientId', coalesce(v_first.data->>'patientId', p_patient_id),
      'patientName', coalesce(v_first.data->>'patientName', p_patient_name),
      'patientUhid', coalesce(v_first.data->>'patientUhid', p_patient_uhid),
      'sourceVisitIds', to_jsonb(coalesce(p_visit_ids,'{}')),
      'sourceAdmissionIds', to_jsonb(coalesce(p_admission_ids,'{}')),
      'sourceSaleIds', to_jsonb(coalesce(p_sale_ids,'{}')),
      'lineItems', coalesce(p_line_items,'[]'::jsonb),
      'subtotal', p_subtotal, 'gstAmount', coalesce(p_gst_amount,0),
      'discount', coalesce(p_discount,0), 'discountReason', p_discount_reason,
      'total', p_total, 'grandTotal', p_total,
      'paymentMode', p_payment_mode, 'paymentStatus', v_status,
      'paidAmount', case when p_payment_mode='insurance' then 0 else p_total end,
      'insuranceClaim', p_insurance, 'invoiceDate', v_now, 'createdByRole', v_role, 'createdAt', v_now, 'updatedAt', v_now
    )
  );

  if p_visit_ids is not null then
    foreach v_x in array p_visit_ids loop
      update public.documents set data = data || jsonb_build_object('billed', true, 'invoiceId', v_id), updated_at = now()
        where path = 'facilities/'||v_fid||'/opdVisits/'||v_x;
    end loop;
  end if;
  if p_admission_ids is not null then
    foreach v_x in array p_admission_ids loop
      update public.documents set data = data || jsonb_build_object('billed', true, 'invoiceId', v_id), updated_at = now()
        where path = 'facilities/'||v_fid||'/ipd/admissions/'||v_x;
    end loop;
  end if;
  if p_sale_ids is not null then
    foreach v_x in array p_sale_ids loop
      update public.documents set data = data || jsonb_build_object('billed', true, 'invoiceId', v_id), updated_at = now()
        where path = 'facilities/'||v_fid||'/pharmacy/sales/'||v_x;
    end loop;
  end if;

  return v_id;
end; $function$;
