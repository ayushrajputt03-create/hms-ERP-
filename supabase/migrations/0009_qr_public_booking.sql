-- Public, no-login QR self-booking into the existing OPD queue.
--
-- The `documents` table has exactly one RLS policy (`documents_rw`) and it is
-- scoped to `authenticated` only — anon has zero table access, by design.
-- So the entire public flow is two SECURITY DEFINER RPCs granted to anon,
-- each hand-picking what it exposes rather than opening the table itself.
--
-- Self-booked visits land in the same facilities/{fid}/opdVisits collection
-- the staff registration desk already writes (see 0008_opd_registration.sql),
-- tagged bookingSource:'qr_self', verified:false, status:'booked'. Reception's
-- existing check-in path (QueueScreen's updateDocument call) already works on
-- any visit row, so verifying one is just filtering + a status flip in the UI
-- — no new authenticated RPC needed for that half.
--
-- Token numbering here is per DOCTOR per local day (facility's departments
-- collection is often empty on real tenants — no department linkage is
-- required to hand out a token), counter key:
--   facilities/{fid}/counters/qrToken-{doctorId}-{YYYY-MM-DD}
-- claimed with the same atomic `insert ... on conflict do update ... returning`
-- pattern as the staff desk's per-department counter, so two phones booking
-- into the same doctor in the same second can never collide.

create or replace function public.get_public_booking_info(p_facility_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_config jsonb;
  v_doctors jsonb;
begin
  select data into v_config from public.documents
   where path = 'facilities/' || p_facility_id || '/config';
  if v_config is null then
    raise exception 'FACILITY_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', regexp_replace(d.path, '^.*/', ''),
           'name', d.data ->> 'name',
           -- departmentId is the modern field; `department` is the legacy
           -- free-text one still populated on most existing staff rows.
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
    'name', v_config ->> 'name',
    'address', v_config ->> 'address',
    'phone', v_config ->> 'phone',
    'doctors', v_doctors
  );
end; $function$;

create or replace function public.book_opd_visit_public(
  p_facility_id     text,
  p_doctor_id       text,
  p_patient_name    text,
  p_patient_phone   text,
  p_patient_age     int,
  p_patient_gender  text,
  p_reason          text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doctor    jsonb;
  v_dept_name text;
  v_now       bigint := (extract(epoch from now()) * 1000)::bigint;
  v_local     date := (now() at time zone 'Asia/Kolkata')::date;
  v_token     bigint;
  v_patient_id text;
  v_dob       date;
  v_id        text;
  v_data      jsonb;
  v_wait      bigint;
begin
  if coalesce(btrim(p_patient_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_patient_phone is null or length(regexp_replace(p_patient_phone, '\D', '', 'g')) < 10 then
    raise exception 'INVALID_PHONE';
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

  -- Returning patient: matched on the last 10 digits of the phone, same rule
  -- src/lib/patients.js uses at the reception desk, so a self-booking never
  -- creates a second record for someone already on file.
  select regexp_replace(d.path, '^.*/', '') into v_patient_id
    from public.documents d
   where d.facility_id = p_facility_id
     and d.collection = 'facilities/' || p_facility_id || '/patients'
     and right(regexp_replace(d.data ->> 'phone', '\D', '', 'g'), 10)
       = right(regexp_replace(p_patient_phone, '\D', '', 'g'), 10)
   limit 1;

  if v_patient_id is null then
    -- The kiosk only collects an age in years, not a date of birth, so one is
    -- backdated from today. `ageApproximate` tells reception (and the print
    -- slip) it was estimated, not entered directly.
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

  -- Token: per doctor, per local day. No department dependency, since real
  -- tenants frequently have no departments seeded yet.
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

  -- Waiting count: other unresolved tokens for this doctor today, issued
  -- before this one — the "X patients ahead of you" line on the confirmation.
  select count(*) into v_wait from public.documents d
   where d.facility_id = p_facility_id
     and d.collection = 'facilities/' || p_facility_id || '/opdVisits'
     and d.data ->> 'doctorId' = p_doctor_id
     and (d.data ->> 'visitDate')::bigint >= extract(epoch from v_local::timestamp) * 1000
     and coalesce((d.data ->> 'tokenNumber')::bigint, 0) < v_token
     and coalesce(d.data ->> 'status', 'booked') in ('booked', 'checked_in', 'in_progress');

  return v_data || jsonb_build_object('id', v_id, 'waitingAhead', v_wait);
end; $function$;

revoke all on function public.get_public_booking_info(text) from public;
revoke all on function public.book_opd_visit_public(text, text, text, text, int, text, text) from public;
grant execute on function public.get_public_booking_info(text) to anon, authenticated;
grant execute on function public.book_opd_visit_public(text, text, text, text, int, text, text) to anon, authenticated;
