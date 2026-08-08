-- Departments on IPD admissions.
--
-- admit_patient already writes the admission and flips the bed under one lock;
-- the department has to be stamped inside that same statement, otherwise a
-- follow-up client update could fail and leave an admission with a bed but no
-- department. The old 5-argument signature is dropped rather than overloaded,
-- because a defaulted 6th argument would make every existing call ambiguous.

drop function if exists public.admit_patient(text, text, text, text, text);

create or replace function public.admit_patient(
  p_patient_id text,
  p_doctor_id text,
  p_ward_id text,
  p_bed_id text,
  p_diagnosis text,
  p_department_id text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid  text := public.hms_current_facility_id();
  v_role text := public.hms_current_role();
  v_ward public.documents%rowtype;
  v_bed  jsonb;
  v_dept jsonb;
  v_pname text; v_puhid text; v_dname text;
  v_aid  text;
  v_now  bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_fid is null then raise exception 'Not a facility member'; end if;
  if v_role not in ('receptionist','facility_admin','super_admin') then
    raise exception 'Role % is not permitted to admit patients', coalesce(v_role,'none');
  end if;

  select * into v_ward from public.documents
    where path = 'facilities/'||v_fid||'/ipd/wards/'||p_ward_id for update;
  if not found then raise exception 'Ward not found'; end if;

  v_bed := v_ward.data->'beds'->p_bed_id;
  if v_bed is null then raise exception 'Bed not found'; end if;
  if (v_bed->>'status') = 'occupied' then
    raise exception 'Bed is not available';
  end if;

  -- A department is optional only so a facility that has not configured any yet
  -- can still admit; when one is sent it must exist and be active.
  if p_department_id is not null then
    select data into v_dept from public.documents
      where path = 'facilities/'||v_fid||'/departments/'||p_department_id;
    if v_dept is null then raise exception 'Department not found'; end if;
    if coalesce(v_dept->>'status','active') = 'inactive' then
      raise exception 'Department is inactive';
    end if;
  end if;

  select data->>'name', data->>'uhid' into v_pname, v_puhid
    from public.documents where path = 'facilities/'||v_fid||'/patients/'||p_patient_id;
  select data->>'name' into v_dname
    from public.documents where path = 'facilities/'||v_fid||'/staff/'||p_doctor_id;

  v_aid := 'adm'||v_now::text||floor(random()*1000)::text;
  insert into public.documents (path, collection, facility_id, data) values (
    'facilities/'||v_fid||'/ipd/admissions/'||v_aid,
    'facilities/'||v_fid||'/ipd/admissions', v_fid,
    jsonb_build_object(
      'patientId', p_patient_id, 'patientName', v_pname, 'patientUhid', v_puhid,
      'doctorId', p_doctor_id, 'doctorName', v_dname,
      'departmentId', p_department_id,
      'departmentName', v_dept->>'name',
      'floor', v_dept->>'floor',
      'wing', v_dept->>'wing',
      'roomNumber', v_dept->>'roomNumber',
      'wardId', p_ward_id, 'wardName', v_ward.data->>'name',
      'bedId', p_bed_id, 'bedName', v_bed->>'name',
      'ratePerDay', coalesce((v_ward.data->>'ratePerDay')::numeric, 0),
      'diagnosis', p_diagnosis, 'admissionDate', v_now,
      'status', 'admitted', 'billed', false,
      'createdAt', v_now, 'updatedAt', v_now
    )
  );

  update public.documents set
    data = jsonb_set(
             jsonb_set(data, array['beds', p_bed_id, 'status'], '"occupied"'),
             array['beds', p_bed_id, 'admissionId'], to_jsonb(v_aid)),
    updated_at = now()
  where path = 'facilities/'||v_fid||'/ipd/wards/'||p_ward_id;

  return v_aid;
end; $function$;

revoke all on function public.admit_patient(text, text, text, text, text, text) from public, anon;
grant execute on function public.admit_patient(text, text, text, text, text, text) to authenticated;
