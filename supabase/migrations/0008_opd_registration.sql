-- OPD registration: server-generated token numbers and department register numbers.
--
-- Both sequences have to be race-free. Two receptionists registering into the
-- same department in the same second must not get the same token, so the
-- counters are claimed with `insert ... on conflict do update ... returning`,
-- which is a single atomic statement, and the visit is written in the same
-- transaction. Nothing about the numbering is computed in the browser.
--
-- Storage is the usual document store — there are no relational OPD tables in
-- this project. A visit is one row at facilities/{fid}/opdVisits/{id}, and each
-- counter is one row at facilities/{fid}/counters/{key} shaped { value: n },
-- matching what increment_counter already writes.
--
--   token counter    facilities/{fid}/counters/opdToken-{deptId}-{YYYY-MM-DD}
--   register counter facilities/{fid}/counters/deptReg-{deptId}-{YYYY}
--
-- The token key carries the visit's local date, so it restarts at 1 at midnight
-- without a scheduled reset job. Dates are resolved in Asia/Kolkata rather than
-- UTC, otherwise the counter would roll over at 05:30 local time.

-- increment_counter is SECURITY DEFINER and so bypasses RLS, but it never
-- verified the caller belongs to the facility in the path — any authenticated
-- user could bump another facility's counters. Re-checked here.
create or replace function public.increment_counter(p_path text, p_field text default 'value')
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_val bigint;
  v_coll text := regexp_replace(p_path, '/[^/]+$', '');
  v_fid  text := case when p_path like 'facilities/%' then split_part(p_path, '/', 2) else null end;
begin
  if v_fid is null or not public.is_facility_member(v_fid) then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;

  insert into public.documents (path, collection, facility_id, data)
    values (p_path, v_coll, v_fid, jsonb_build_object(p_field, 1))
  on conflict (path) do update
    set data = documents.data
               || jsonb_build_object(p_field, coalesce((documents.data->>p_field)::bigint, 0) + 1),
        updated_at = now()
  returning (data->>p_field)::bigint into v_val;
  return v_val;
end; $function$;

create or replace function public.register_opd_visit(
  p_patient_id      text,
  p_department_id   text,
  p_doctor_id       text,
  p_visit_date      bigint default null,
  p_chief_complaint text default null,
  p_billing_type    text default 'general',
  p_unit            text default null
) returns jsonb
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
  -- The UI filters the doctor dropdown by department; enforce the same rule
  -- here so a hand-crafted request cannot book across departments.
  if coalesce(v_doctor ->> 'departmentId', '') <> p_department_id then
    raise exception 'DOCTOR_NOT_IN_DEPARTMENT';
  end if;

  v_local := (to_timestamp(v_visit_at / 1000.0) at time zone 'Asia/Kolkata')::date;
  v_code  := coalesce(nullif(v_dept ->> 'code', ''), upper(substr(p_department_id, 1, 6)));

  -- Token: per department, per local day.
  insert into public.documents (path, collection, facility_id, data)
    values ('facilities/' || v_fid || '/counters/opdToken-' || p_department_id || '-' || to_char(v_local, 'YYYY-MM-DD'),
            'facilities/' || v_fid || '/counters', v_fid, jsonb_build_object('value', 1))
  on conflict (path) do update
    set data = documents.data
               || jsonb_build_object('value', coalesce((documents.data ->> 'value')::bigint, 0) + 1),
        updated_at = now()
  returning (data ->> 'value')::bigint into v_token;

  -- Department register number: per department, per calendar year.
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
    -- Snapshotted, so renaming or relocating the department later never
    -- rewrites a slip the patient is already holding.
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
end; $function$;

revoke all on function public.increment_counter(text, text) from public, anon;
revoke all on function public.register_opd_visit(text, text, text, bigint, text, text, text) from public, anon;
grant execute on function public.increment_counter(text, text) to authenticated;
grant execute on function public.register_opd_visit(text, text, text, bigint, text, text, text) to authenticated;
