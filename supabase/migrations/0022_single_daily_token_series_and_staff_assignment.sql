-- Two defects in OPD token issue, with one shared root.
--
-- 1. DUPLICATE TOKEN NUMBERS ON THE SAME DAY
--
-- Two independent counter series were being incremented for the same day:
--
--     staff desk : counters/opdToken-{departmentId}-{YYYY-MM-DD}
--     QR self    : counters/qrToken-{doctorId}-{YYYY-MM-DD}
--
-- Nothing tied them together, so both handed out "1" on the same morning.
-- This is not hypothetical — it is already in the data. On 2026-08-09 the
-- ORTHO department has two live visits both holding tokenNumber 1, one
-- registered at the counter and one self-booked by QR, for the same doctor.
--
-- TokenLookup returning several matches for one token was written up as
-- expected behaviour ("tokens are per-department and per-doctor"). It was the
-- collision showing through. A token is a thing a human is holding on a slip
-- and calling out across a waiting room; two people cannot both have number 1.
--
-- Fixed by collapsing to ONE series per facility per day:
--
--     counters/opdToken-{YYYY-MM-DD}
--
-- Every token issued on a given day is now unique across the whole facility,
-- whoever issued it and by whichever route. Department identity has not been
-- lost — deptRegNo remains the per-department, per-year register number, which
-- is the field that is actually meant to carry it. Queue ordering within a
-- department is unaffected: tokens are still monotonic, just not restarting
-- per department.
--
-- The date is always the IST calendar date. A UTC date would roll the series
-- over at 05:30 IST, mid-morning OPD.
--
-- 2. THE PATIENT WAS CHOOSING THE DOCTOR
--
-- book_opd_visit_public took p_doctor_id from the public page, so whoever
-- scanned the poster picked their own consultant, and the visit was written
-- with that doctor already assigned. Reception's "verify" button only
-- confirmed identity; it could not change the clinical routing.
--
-- Triage is a staff decision. A patient does not know which department their
-- complaint belongs to, and cannot see who is on leave, who is overbooked, or
-- who is in theatre. Self-booking now collects identity only and issues a
-- token; department and doctor are assigned by staff at the counter through
-- hms_assign_qr_visit below, which applies the same validation the counter
-- registration path already does.

-- ---------------------------------------------------------------------------
-- 0. The one place a token number is allocated
-- ---------------------------------------------------------------------------
-- Both issuing paths call this and nothing else increments the series. The
-- duplicate-token bug existed precisely because there were two copies of this
-- logic with different keys; a single definition is what stops it recurring.
--
-- The upsert is atomic, so two counters registering at the same instant are
-- serialised by the row lock and cannot be handed the same number.
create or replace function public.hms_next_opd_token(p_facility_id text, p_local_date date)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token bigint;
begin
  insert into public.documents (path, collection, facility_id, data)
    values ('facilities/' || p_facility_id || '/counters/opdToken-' || to_char(p_local_date, 'YYYY-MM-DD'),
            'facilities/' || p_facility_id || '/counters', p_facility_id, jsonb_build_object('value', 1))
  on conflict (path) do update
    set data = documents.data
               || jsonb_build_object('value', coalesce((documents.data ->> 'value')::bigint, 0) + 1),
        updated_at = now()
  returning (data ->> 'value')::bigint into v_token;
  return v_token;
end;
$function$;

-- Internal helper. Callable only through the two RPCs above it, never directly
-- by a client — a client that could burn token numbers could desynchronise the
-- series from the slips already printed.
revoke all on function public.hms_next_opd_token(text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Staff registration: facility-wide daily token series
-- ---------------------------------------------------------------------------
create or replace function public.register_opd_visit(
  p_patient_id text,
  p_department_id text,
  p_doctor_id text,
  p_visit_date bigint default null,
  p_chief_complaint text default null,
  p_billing_type text default 'general',
  p_unit text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid      text := public.hms_current_facility_id();
  v_dept     jsonb;
  v_patient  jsonb;
  v_doctor   jsonb;
  v_now      bigint := (extract(epoch from now()) * 1000)::bigint;
  v_visit_at bigint := coalesce(p_visit_date, (extract(epoch from now()) * 1000)::bigint);
  v_local    date;
  v_code     text;
  v_token    bigint;
  v_seq      bigint;
  v_fee      numeric;
  v_id       text;
  v_data     jsonb;
begin
  if v_fid is null then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;

  select data into v_dept from public.documents
   where path = 'facilities/' || v_fid || '/departments/' || p_department_id;
  if v_dept is null then
    raise exception 'DEPARTMENT_NOT_FOUND';
  end if;
  if coalesce(v_dept ->> 'status', 'active') = 'inactive' then
    raise exception 'DEPARTMENT_INACTIVE';
  end if;
  if coalesce(v_dept ->> 'departmentType', 'both') not in ('both', 'opd') then
    raise exception 'DEPARTMENT_NOT_OPD';
  end if;

  select data into v_patient from public.documents
   where path = 'facilities/' || v_fid || '/patients/' || p_patient_id;
  if v_patient is null then
    raise exception 'PATIENT_NOT_FOUND';
  end if;

  select data into v_doctor from public.documents
   where path = 'facilities/' || v_fid || '/staff/' || p_doctor_id;
  if v_doctor is null then
    raise exception 'DOCTOR_NOT_FOUND';
  end if;
  if coalesce(v_doctor ->> 'departmentId', '') <> p_department_id then
    raise exception 'DOCTOR_NOT_IN_DEPARTMENT';
  end if;

  v_local := (to_timestamp(v_visit_at / 1000.0) at time zone 'Asia/Kolkata')::date;
  v_code  := coalesce(nullif(v_dept ->> 'code', ''), upper(substr(p_department_id, 1, 6)));

  -- Facility-wide for the day. The department is no longer part of the key.
  v_token := public.hms_next_opd_token(v_fid, v_local);

  -- deptRegNo stays per-department, per-year: it is the register number, and
  -- a department's register is exactly what it is meant to be scoped to.
  insert into public.documents (path, collection, facility_id, data)
    values ('facilities/' || v_fid || '/counters/deptReg-' || p_department_id || '-' || to_char(v_local, 'YYYY'),
            'facilities/' || v_fid || '/counters', v_fid, jsonb_build_object('value', 1))
  on conflict (path) do update
    set data = documents.data
               || jsonb_build_object('value', coalesce((documents.data ->> 'value')::bigint, 0) + 1),
        updated_at = now()
  returning (data ->> 'value')::bigint into v_seq;

  v_fee := public.get_consultation_fee(v_fid, p_doctor_id);
  v_id  := 'v' || v_now::text || floor(random() * 1000)::text;

  v_data := jsonb_build_object(
    'patientId',       p_patient_id,
    'patientName',     v_patient ->> 'name',
    'patientUhid',     v_patient ->> 'uhid',
    'doctorId',        p_doctor_id,
    'doctorName',      v_doctor ->> 'name',
    'departmentId',    p_department_id,
    'departmentName',  v_dept ->> 'name',
    'departmentCode',  v_code,
    'floor',           v_dept ->> 'floor',
    'wing',            v_dept ->> 'wing',
    'roomNumber',      v_dept ->> 'roomNumber',
    'unit',            p_unit,
    'tokenNumber',     v_token,
    'deptRegNo',       to_char(v_local, 'YYYY') || '/' || v_code || '/' || lpad(v_seq::text, 7, '0'),
    'billingType',     coalesce(p_billing_type, 'general'),
    'feeAmount',       v_fee,
    'registeredBy',    auth.uid()::text,
    'status',          'booked',
    'visitDate',       v_visit_at,
    'chiefComplaint',  nullif(btrim(coalesce(p_chief_complaint, '')), ''),
    'facilityId',      v_fid,
    'createdAt',       v_now,
    'updatedAt',       v_now
  );

  insert into public.documents (path, collection, facility_id, data)
  values ('facilities/' || v_fid || '/opdVisits/' || v_id,
          'facilities/' || v_fid || '/opdVisits', v_fid, v_data);

  return v_data || jsonb_build_object('id', v_id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Public self-booking: identity only, no clinical routing
-- ---------------------------------------------------------------------------
-- The old 7-argument form (which took p_doctor_id) is dropped rather than left
-- in place. Leaving it would keep a live, anon-callable path that still lets
-- the public assign its own doctor, which is the whole defect.
drop function if exists public.book_opd_visit_public(text, text, text, text, integer, text, text);

create or replace function public.book_opd_visit_public(
  p_facility_id text,
  p_patient_name text,
  p_patient_phone text,
  p_patient_age integer default null,
  p_patient_gender text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_config     jsonb;
  v_now        bigint := (extract(epoch from now()) * 1000)::bigint;
  v_local      date := (now() at time zone 'Asia/Kolkata')::date;
  v_day_start  bigint;
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

  select data into v_config from public.documents
   where path = 'facilities/' || p_facility_id || '/config';
  if v_config is null then
    raise exception 'FACILITY_NOT_FOUND';
  end if;
  if coalesce((v_config -> 'modules' ->> 'opd')::boolean, false) <> true then
    raise exception 'OPD_DISABLED';
  end if;

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

  -- Same series the counter uses. This is the whole point: one queue, one
  -- numbering, whichever door the patient came through.
  v_token := public.hms_next_opd_token(p_facility_id, v_local);

  v_id := 'v' || v_now::text || floor(random() * 1000)::text;
  v_data := jsonb_build_object(
    'patientId', v_patient_id,
    'patientName', btrim(p_patient_name),
    -- Deliberately null. Staff assign these at the counter; a self-booked
    -- visit is a place in the queue, not a clinical decision.
    'doctorId', null,
    'doctorName', null,
    'departmentId', null,
    'departmentName', null,
    'needsAssignment', true,
    'tokenNumber', v_token,
    'billingType', 'general',
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

  -- People ahead is now a facility-wide count, matching the single series.
  --
  -- The old version computed the day boundary as
  --   extract(epoch from v_local::timestamp) * 1000
  -- which reads an IST calendar date as if it were UTC midnight — 5h30m adrift,
  -- so the early-morning slice of the queue was silently excluded from the
  -- count. Boundary now goes through the same IST conversion used everywhere.
  v_day_start := (extract(epoch from (v_local::timestamp at time zone 'Asia/Kolkata')) * 1000)::bigint;

  select count(*) into v_wait from public.documents d
   where d.facility_id = p_facility_id
     and d.collection = 'facilities/' || p_facility_id || '/opdVisits'
     and coalesce(nullif(d.data ->> 'visitDate', ''), '0')::bigint >= v_day_start
     and coalesce(nullif(d.data ->> 'tokenNumber', ''), '0')::bigint < v_token
     and coalesce(d.data ->> 'status', 'booked') in ('booked', 'checked_in', 'in_progress');

  return v_data || jsonb_build_object('id', v_id, 'waitingAhead', v_wait);
end;
$function$;

revoke all on function public.book_opd_visit_public(text, text, text, integer, text, text) from public;
grant execute on function public.book_opd_visit_public(text, text, text, integer, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Counter assignment of a self-booked visit
-- ---------------------------------------------------------------------------
-- The staff-side other half of the change above. Reception picks department
-- and doctor, and this stamps the visit with everything the counter path
-- already stamps: department snapshot, register number and fee.
--
-- Validation is identical to register_opd_visit's on purpose — a visit that
-- arrived by QR must not be able to reach a state the counter could not have
-- produced (inactive department, IPD-only department, doctor from a different
-- department).
--
-- The department snapshot is copied onto the visit rather than joined at read
-- time because a printed parchi is a record of where the patient was sent that
-- day. If ORTHO moves from 5th floor to 2nd next month, last month's slip must
-- still say 5th.
create or replace function public.hms_assign_qr_visit(
  p_visit_id text,
  p_department_id text,
  p_doctor_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid    text := public.hms_current_facility_id();
  v_path   text;
  v_visit  jsonb;
  v_dept   jsonb;
  v_doctor jsonb;
  v_local  date;
  v_code   text;
  v_seq    bigint;
  v_now    bigint := (extract(epoch from now()) * 1000)::bigint;
  v_patch  jsonb;
begin
  if v_fid is null then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;

  v_path := 'facilities/' || v_fid || '/opdVisits/' || p_visit_id;
  select data into v_visit from public.documents where path = v_path;
  if v_visit is null then
    raise exception 'VISIT_NOT_FOUND';
  end if;

  -- Assignment allocates a register number, so it must not run twice on the
  -- same visit. A double-click would otherwise burn a deptReg sequence value
  -- and leave a gap in the register.
  if coalesce(v_visit ->> 'departmentId', '') <> '' then
    raise exception 'VISIT_ALREADY_ASSIGNED';
  end if;

  select data into v_dept from public.documents
   where path = 'facilities/' || v_fid || '/departments/' || p_department_id;
  if v_dept is null then
    raise exception 'DEPARTMENT_NOT_FOUND';
  end if;
  if coalesce(v_dept ->> 'status', 'active') = 'inactive' then
    raise exception 'DEPARTMENT_INACTIVE';
  end if;
  if coalesce(v_dept ->> 'departmentType', 'both') not in ('both', 'opd') then
    raise exception 'DEPARTMENT_NOT_OPD';
  end if;

  select data into v_doctor from public.documents
   where path = 'facilities/' || v_fid || '/staff/' || p_doctor_id;
  if v_doctor is null then
    raise exception 'DOCTOR_NOT_FOUND';
  end if;
  if coalesce(v_doctor ->> 'departmentId', '') <> p_department_id then
    raise exception 'DOCTOR_NOT_IN_DEPARTMENT';
  end if;

  v_local := (to_timestamp(coalesce(nullif(v_visit ->> 'visitDate', ''), v_now::text)::bigint / 1000.0)
              at time zone 'Asia/Kolkata')::date;
  v_code  := coalesce(nullif(v_dept ->> 'code', ''), upper(substr(p_department_id, 1, 6)));

  insert into public.documents (path, collection, facility_id, data)
    values ('facilities/' || v_fid || '/counters/deptReg-' || p_department_id || '-' || to_char(v_local, 'YYYY'),
            'facilities/' || v_fid || '/counters', v_fid, jsonb_build_object('value', 1))
  on conflict (path) do update
    set data = documents.data
               || jsonb_build_object('value', coalesce((documents.data ->> 'value')::bigint, 0) + 1),
        updated_at = now()
  returning (data ->> 'value')::bigint into v_seq;

  -- The token is NOT reissued. The patient is holding it already.
  v_patch := jsonb_build_object(
    'doctorId',       p_doctor_id,
    'doctorName',     v_doctor ->> 'name',
    'departmentId',   p_department_id,
    'departmentName', v_dept ->> 'name',
    'departmentCode', v_code,
    'floor',          v_dept ->> 'floor',
    'wing',           v_dept ->> 'wing',
    'roomNumber',     v_dept ->> 'roomNumber',
    'deptRegNo',      to_char(v_local, 'YYYY') || '/' || v_code || '/' || lpad(v_seq::text, 7, '0'),
    'feeAmount',      public.get_consultation_fee(v_fid, p_doctor_id),
    'needsAssignment', false,
    'verified',       true,
    'status',         'checked_in',
    'checkedInAt',    v_now,
    'assignedBy',     auth.uid()::text,
    'updatedAt',      v_now
  );

  update public.documents
     set data = data || v_patch, updated_at = now()
   where path = v_path;

  return (v_visit || v_patch) || jsonb_build_object('id', p_visit_id);
end;
$function$;

revoke all on function public.hms_assign_qr_visit(text, text, text) from public, anon;
grant execute on function public.hms_assign_qr_visit(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public booking info no longer advertises doctors
-- ---------------------------------------------------------------------------
-- The doctor list existed only to populate the public dropdown. With routing
-- moved to the counter there is nothing to pick, and publishing the roster of
-- every doctor on duty to an unauthenticated endpoint is a disclosure with no
-- remaining purpose. `accepting` reports whether the desk can take a walk-in
-- at all, which is the only thing the page still needs to know.
create or replace function public.get_public_booking_info(p_facility_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_config jsonb;
  v_docs   bigint;
begin
  select data into v_config from public.documents
   where path = 'facilities/' || p_facility_id || '/config';
  if v_config is null then
    raise exception 'FACILITY_NOT_FOUND';
  end if;
  if coalesce((v_config -> 'modules' ->> 'opd')::boolean, false) <> true then
    raise exception 'OPD_DISABLED';
  end if;

  select count(*) into v_docs from public.documents d
   where d.collection = 'facilities/' || p_facility_id || '/staff'
     and d.data ->> 'role' = 'doctor'
     and coalesce(d.data ->> 'status', 'active') = 'active';

  return jsonb_build_object(
    'name', coalesce(v_config ->> 'facilityName', v_config ->> 'name'),
    'address', v_config ->> 'address',
    'accepting', v_docs > 0
  );
end;
$function$;

revoke all on function public.get_public_booking_info(text) from public;
grant execute on function public.get_public_booking_info(text) to anon, authenticated;
