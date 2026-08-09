-- Two unrelated correctness fixes that both live in the database.
--
-- ---------------------------------------------------------------------------
-- 1. Dashboard statistics, computed server-side
-- ---------------------------------------------------------------------------
-- The dashboard's stat cards were literal placeholders: "Today's OPD" rendered
-- the string "—", "Today's Revenue" rendered "₹0", pending lab and low stock
-- both rendered "0". The underlying data has existed for a while; nothing was
-- ever asked for it. A dashboard that confidently shows ₹0 on a day with
-- takings is worse than one that shows nothing.
--
-- These are aggregates, so they belong on the server. Fetching four whole
-- collections into the browser to count them would reintroduce exactly the
-- problem the patient-count fix removed.
--
-- The facility is resolved from the caller's own session, never passed in — a
-- parameter that could be passed could also be forged.

create or replace function public.hms_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_fid       text := public.hms_current_facility_id();
  v_day_start bigint;
  v_day_end   bigint;
  v_opd       bigint;
  v_revenue   numeric;
  v_lab       bigint;
  v_low       bigint;
  v_admitted  bigint;
  v_unpaid    numeric;
begin
  if v_fid is null then
    return null;
  end if;

  -- "Today" means the hospital's today, not UTC's. A bill taken at 9pm IST
  -- must not land on tomorrow's card.
  v_day_start := (extract(epoch from (
                    date_trunc('day', now() at time zone 'Asia/Kolkata')
                  ) at time zone 'Asia/Kolkata') * 1000)::bigint;
  v_day_end   := v_day_start + 86400000 - 1;

  select count(*) into v_opd
    from public.documents
   where collection = 'facilities/' || v_fid || '/opdVisits'
     and coalesce(nullif(data ->> 'visitDate', ''), '0')::bigint between v_day_start and v_day_end
     and coalesce(data ->> 'status', 'booked') <> 'cancelled';

  -- paidAmount, not grandTotal: the card says what came in today, and a
  -- part-paid bill has not brought in its full value.
  select coalesce(sum(coalesce(nullif(data ->> 'paidAmount', ''), '0')::numeric), 0)
    into v_revenue
    from public.documents
   where collection = 'facilities/' || v_fid || '/billing'
     and coalesce(data ->> 'type', '') = 'invoice'
     and coalesce(nullif(data ->> 'invoiceDate', ''), '0')::bigint between v_day_start and v_day_end;

  -- Anything short of a released report is still work in the lab's queue.
  select count(*) into v_lab
    from public.documents
   where collection = 'facilities/' || v_fid || '/lab/orders'
     and coalesce(data ->> 'status', 'ordered') <> 'report_ready';

  -- Stock is the sum of a medicine's batches, matching stockByMedicine() on
  -- the client, so the dashboard count and the pharmacy screen agree.
  select count(*) into v_low
    from public.documents m
    cross join lateral (
      select coalesce(sum(coalesce(nullif(b.data ->> 'quantity', ''), '0')::numeric), 0) as qty
        from public.documents b
       where b.collection = 'facilities/' || v_fid || '/pharmacy/batches'
         and b.data ->> 'medicineId' = split_part(m.path, '/', 5)
    ) s
   where m.collection = 'facilities/' || v_fid || '/pharmacy/medicines'
     and coalesce(nullif(m.data ->> 'reorderThreshold', ''), '0')::numeric > 0
     and s.qty < coalesce(nullif(m.data ->> 'reorderThreshold', ''), '0')::numeric;

  select count(*) into v_admitted
    from public.documents
   where collection = 'facilities/' || v_fid || '/ipd/admissions'
     and coalesce(data ->> 'status', 'admitted') = 'admitted';

  -- Outstanding is not time-boxed on purpose: money owed from last month is
  -- still owed today, and that is the number a manager acts on.
  select coalesce(sum(
           coalesce(nullif(data ->> 'grandTotal', ''), '0')::numeric
           - coalesce(nullif(data ->> 'paidAmount', ''), '0')::numeric
         ), 0)
    into v_unpaid
    from public.documents
   where collection = 'facilities/' || v_fid || '/billing'
     and coalesce(data ->> 'type', '') = 'invoice'
     and coalesce(data ->> 'paymentStatus', '') <> 'paid';

  return jsonb_build_object(
    'opdToday',       v_opd,
    'revenueToday',   v_revenue,
    'labPending',     v_lab,
    'lowStock',       v_low,
    'admitted',       v_admitted,
    'outstanding',    greatest(v_unpaid, 0)
  );
end;
$function$;

-- Supabase's default privileges hand EXECUTE on new public functions to `anon`
-- directly, so revoking from PUBLIC alone would leave it callable.
revoke all on function public.hms_dashboard_stats() from public, anon;
grant execute on function public.hms_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Public QR booking ignored the OPD module toggle
-- ---------------------------------------------------------------------------
-- /book/:facilityId sits outside the authenticated part of the app and these
-- two RPCs are granted to anon, which is correct — a patient scanning a poster
-- has no account. What was missing is that neither asked whether the facility
-- actually runs OPD.
--
-- A hospital that turns OPD off keeps a live public booking page. Patients get
-- a token; staff never see the queue, because every OPD screen is behind
-- ModuleGate. Visits accumulate that nobody is watching. One such orphaned
-- qr_self visit already exists in this database.
--
-- Also fixed here: the info RPC read `name` from the facility config, but the
-- config field is `facilityName`. The public page has been rendering a blank
-- hospital name. Both keys are accepted now so older records keep working.

create or replace function public.get_public_booking_info(p_facility_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_config  jsonb;
  v_doctors jsonb;
begin
  select data into v_config from public.documents
   where path = 'facilities/' || p_facility_id || '/config';
  if v_config is null then
    raise exception 'FACILITY_NOT_FOUND';
  end if;

  if coalesce((v_config -> 'modules' ->> 'opd')::boolean, false) <> true then
    raise exception 'OPD_DISABLED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', regexp_replace(d.path, '^.*/', ''),
           'name', d.data ->> 'name',
           'department', coalesce(
             (select dep.data ->> 'name' from public.documents dep
               where dep.path = 'facilities/' || p_facility_id || '/departments/' || (d.data ->> 'departmentId')),
             d.data ->> 'department'
           )
         ) order by d.data ->> 'name'), '[]'::jsonb)
    into v_doctors
    from public.documents d
   where d.facility_id = p_facility_id
     and d.collection = 'facilities/' || p_facility_id || '/staff'
     and d.data ->> 'role' = 'doctor'
     and coalesce(d.data ->> 'status', 'active') = 'active';

  return jsonb_build_object(
    'facilityId', p_facility_id,
    'name', coalesce(v_config ->> 'facilityName', v_config ->> 'name'),
    'address', v_config ->> 'address',
    'phone', v_config ->> 'phone',
    'doctors', v_doctors
  );
end;
$function$;

create or replace function public.book_opd_visit_public(
  p_facility_id text, p_doctor_id text, p_patient_name text, p_patient_phone text,
  p_patient_age integer, p_patient_gender text, p_reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_config     jsonb;
  v_doctor     jsonb;
  v_dept_name  text;
  v_now        bigint := (extract(epoch from now()) * 1000)::bigint;
  v_local      date := (now() at time zone 'Asia/Kolkata')::date;
  v_token      bigint;
  v_patient_id text;
  v_dob        date;
  v_id         text;
  v_data       jsonb;
  v_wait       bigint;
begin
  if coalesce(btrim(p_patient_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_patient_phone is null or length(regexp_replace(p_patient_phone, '\D', '', 'g')) < 10 then
    raise exception 'INVALID_PHONE';
  end if;

  -- Re-checked here and not only in get_public_booking_info: this RPC is
  -- callable directly, so a gate that only guards the page it renders is not
  -- a gate at all.
  select data into v_config from public.documents
   where path = 'facilities/' || p_facility_id || '/config';
  if v_config is null then
    raise exception 'FACILITY_NOT_FOUND';
  end if;
  if coalesce((v_config -> 'modules' ->> 'opd')::boolean, false) <> true then
    raise exception 'OPD_DISABLED';
  end if;

  select data into v_doctor from public.documents
   where path = 'facilities/' || p_facility_id || '/staff/' || p_doctor_id
     and facility_id = p_facility_id;
  if v_doctor is null then
    raise exception 'DOCTOR_NOT_FOUND';
  end if;
  if coalesce(v_doctor ->> 'role', '') <> 'doctor'
     or coalesce(v_doctor ->> 'status', 'active') <> 'active' then
    raise exception 'DOCTOR_NOT_AVAILABLE';
  end if;

  select coalesce(
           (select dep.data ->> 'name' from public.documents dep
             where dep.path = 'facilities/' || p_facility_id || '/departments/' || (v_doctor ->> 'departmentId')),
           v_doctor ->> 'department'
         ) into v_dept_name;

  select regexp_replace(d.path, '^.*/', '') into v_patient_id
    from public.documents d
   where d.facility_id = p_facility_id
     and d.collection = 'facilities/' || p_facility_id || '/patients'
     and right(regexp_replace(d.data ->> 'phone', '\D', '', 'g'), 10)
       = right(regexp_replace(p_patient_phone, '\D', '', 'g'), 10)
   limit 1;

  if v_patient_id is null then
    v_dob := (v_local - make_interval(years => greatest(coalesce(p_patient_age, 0), 0)));
    v_id  := 'p' || v_now::text || floor(random() * 1000)::text;
    insert into public.documents (path, collection, facility_id, data)
    values (
      'facilities/' || p_facility_id || '/patients/' || v_id,
      'facilities/' || p_facility_id || '/patients',
      p_facility_id,
      jsonb_build_object(
        'name', btrim(p_patient_name),
        'phone', p_patient_phone,
        'gender', coalesce(nullif(p_patient_gender, ''), 'other'),
        'dob', to_char(v_dob, 'YYYY-MM-DD'),
        'ageApproximate', true,
        'patientType', 'non_mlc',
        'facilityId', p_facility_id,
        'source', 'qr_self',
        'createdAt', v_now, 'updatedAt', v_now
      )
    );
    v_patient_id := v_id;
  end if;

  insert into public.documents (path, collection, facility_id, data)
    values ('facilities/' || p_facility_id || '/counters/qrToken-' || p_doctor_id || '-' || to_char(v_local, 'YYYY-MM-DD'),
            'facilities/' || p_facility_id || '/counters', p_facility_id, jsonb_build_object('value', 1))
  on conflict (path) do update
    set data = documents.data
               || jsonb_build_object('value', coalesce((documents.data ->> 'value')::bigint, 0) + 1),
        updated_at = now()
  returning (data ->> 'value')::bigint into v_token;

  v_id := 'v' || v_now::text || floor(random() * 1000)::text;
  v_data := jsonb_build_object(
    'patientId', v_patient_id,
    'patientName', btrim(p_patient_name),
    'doctorId', p_doctor_id,
    'doctorName', v_doctor ->> 'name',
    'departmentId', v_doctor ->> 'departmentId',
    'departmentName', v_dept_name,
    'tokenNumber', v_token,
    'billingType', 'general',
    'feeAmount', public.get_consultation_fee(p_facility_id, p_doctor_id),
    'bookingSource', 'qr_self',
    'verified', false,
    'status', 'booked',
    'visitDate', v_now,
    'chiefComplaint', nullif(btrim(coalesce(p_reason, '')), ''),
    'facilityId', p_facility_id,
    'createdAt', v_now, 'updatedAt', v_now
  );

  insert into public.documents (path, collection, facility_id, data)
  values ('facilities/' || p_facility_id || '/opdVisits/' || v_id,
          'facilities/' || p_facility_id || '/opdVisits', p_facility_id, v_data);

  select count(*) into v_wait from public.documents d
   where d.facility_id = p_facility_id
     and d.collection = 'facilities/' || p_facility_id || '/opdVisits'
     and d.data ->> 'doctorId' = p_doctor_id
     and (d.data ->> 'visitDate')::bigint >= extract(epoch from v_local::timestamp) * 1000
     and coalesce((d.data ->> 'tokenNumber')::bigint, 0) < v_token
     and coalesce(d.data ->> 'status', 'booked') in ('booked', 'checked_in', 'in_progress');

  return v_data || jsonb_build_object('id', v_id, 'waitingAhead', v_wait);
end;
$function$;
