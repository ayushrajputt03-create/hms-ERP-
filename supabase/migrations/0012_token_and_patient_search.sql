-- Token lookup + patient search for the registration desk and the dashboard.
--
-- Two notes on how this differs from a classic relational HMS schema, because
-- both shaped the API below:
--
-- 1. There is no `opd_visits` / `patients` table. Everything lives in
--    public.documents (path, collection, facility_id, data jsonb). So the
--    "indexes on opd_visits(token)" become expression indexes on documents.
--
-- 2. Tokens are NOT hospital-wide. Two counters already exist and both are
--    already atomic (0008 staff desk, 0009 QR kiosk):
--      staff desk -> per DEPARTMENT per day  (counters/token-{deptId}-{date})
--      QR kiosk   -> per DOCTOR per day      (counters/qrToken-{docId}-{date})
--    That means token "7" is genuinely ambiguous across a hospital — Ortho 7
--    and Medicine 7 both exist on the same morning. get_visit_by_token
--    therefore returns an ARRAY of matches, and the desk disambiguates by
--    department/doctor. Collapsing this to a single row would have silently
--    handed the counter clerk the wrong patient.
--
-- Both functions derive the facility from the caller's session rather than
-- taking it as an argument. A facility_id parameter on an authenticated
-- search RPC is a cross-tenant read waiting to happen; the session value
-- cannot be forged by the client.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

-- Dashboard search matches name with ILIKE '%q%'. Only a trigram index can
-- serve an unanchored ILIKE; a plain btree cannot.
create index if not exists documents_name_trgm_idx
  on public.documents using gin (lower(data ->> 'name') gin_trgm_ops);

-- Phone search is matched on the trailing 10 digits (the same rule
-- src/lib/patients.js and 0009 already use), so the index has to be on that
-- exact expression to be usable.
create index if not exists documents_phone10_idx
  on public.documents (facility_id, right(regexp_replace(data ->> 'phone', '\D', '', 'g'), 10));

-- Token search: facility + token number, narrowed further by visitDate in the
-- query itself.
create index if not exists documents_token_idx
  on public.documents (facility_id, collection, ((data ->> 'tokenNumber')::bigint));

analyze public.documents;

-- ---------------------------------------------------------------------------
-- get_visit_by_token
-- ---------------------------------------------------------------------------
create or replace function public.get_visit_by_token(
  p_token_number bigint,
  p_token_date   date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_fid   text := public.hms_current_facility_id();
  v_date  date := coalesce(p_token_date, (now() at time zone 'Asia/Kolkata')::date);
  v_from  bigint;
  v_to    bigint;
  v_rows  jsonb;
begin
  if v_fid is null or not public.is_facility_member(v_fid) then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;
  if p_token_number is null then
    raise exception 'TOKEN_REQUIRED';
  end if;

  -- visitDate is epoch-ms; bound it to the requested local (IST) day so a
  -- token from last Tuesday never surfaces on today's search.
  v_from := (extract(epoch from (v_date::timestamp at time zone 'Asia/Kolkata')) * 1000)::bigint;
  v_to   := (extract(epoch from ((v_date + 1)::timestamp at time zone 'Asia/Kolkata')) * 1000)::bigint;

  select coalesce(jsonb_agg(x order by x ->> 'departmentName' nulls last), '[]'::jsonb)
    into v_rows
  from (
    select jsonb_build_object(
             'id',             regexp_replace(v.path, '^.*/', ''),
             'tokenNumber',    (v.data ->> 'tokenNumber')::bigint,
             'deptRegNo',      v.data ->> 'deptRegNo',
             'status',         coalesce(v.data ->> 'status', 'booked'),
             'verified',       coalesce((v.data ->> 'verified')::boolean, true),
             'bookingSource',  coalesce(v.data ->> 'bookingSource', 'counter'),
             'departmentId',   v.data ->> 'departmentId',
             'departmentName', v.data ->> 'departmentName',
             'doctorId',       v.data ->> 'doctorId',
             'doctorName',     v.data ->> 'doctorName',
             'feeAmount',      coalesce((v.data ->> 'feeAmount')::numeric, 0),
             'billingType',    v.data ->> 'billingType',
             'chiefComplaint', v.data ->> 'chiefComplaint',
             'visitDate',      (v.data ->> 'visitDate')::bigint,
             'patientId',      v.data ->> 'patientId',
             'patient',        case when p.data is null then null else jsonb_build_object(
                                 'id',     v.data ->> 'patientId',
                                 'name',   p.data ->> 'name',
                                 'uhid',   p.data ->> 'uhid',
                                 'gender', p.data ->> 'gender',
                                 'dob',    p.data ->> 'dob',
                                 'phone',  p.data ->> 'phone',
                                 'ageApproximate', coalesce((p.data ->> 'ageApproximate')::boolean, false),
                                 'guardianName',   p.data ->> 'guardianName',
                                 'relationType',   p.data ->> 'relationType',
                                 'address', p.data ->> 'address',
                                 'city',    p.data ->> 'city',
                                 'abhaId',  p.data ->> 'abhaId'
                               ) end
           ) as x
      from public.documents v
      left join public.documents p
        on p.path = 'facilities/' || v_fid || '/patients/' || (v.data ->> 'patientId')
     where v.facility_id = v_fid
       and v.collection  = 'facilities/' || v_fid || '/opdVisits'
       and (v.data ->> 'tokenNumber')::bigint = p_token_number
       and (v.data ->> 'visitDate')::bigint >= v_from
       and (v.data ->> 'visitDate')::bigint <  v_to
  ) s;

  return jsonb_build_object(
    'tokenNumber', p_token_number,
    'tokenDate',   to_char(v_date, 'YYYY-MM-DD'),
    'matches',     v_rows
  );
end; $function$;

-- ---------------------------------------------------------------------------
-- search_patients
-- ---------------------------------------------------------------------------
create or replace function public.search_patients(
  p_query text,
  p_limit int default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_fid    text := public.hms_current_facility_id();
  v_q      text := btrim(coalesce(p_query, ''));
  v_digits text;
  v_limit  int  := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows   jsonb;
begin
  if v_fid is null or not public.is_facility_member(v_fid) then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;
  -- A 1-character query would scan and return most of the register; make the
  -- desk type enough to be meaningful.
  if length(v_q) < 2 then
    return '[]'::jsonb;
  end if;

  v_digits := regexp_replace(v_q, '\D', '', 'g');

  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb)
    into v_rows
  from (
    select jsonb_build_object(
             'id',     regexp_replace(p.path, '^.*/', ''),
             'name',   p.data ->> 'name',
             'uhid',   p.data ->> 'uhid',
             'phone',  p.data ->> 'phone',
             'gender', p.data ->> 'gender',
             'dob',    p.data ->> 'dob',
             'status', coalesce(p.data ->> 'status', 'active'),
             'lastVisit', (
               select jsonb_build_object(
                        'id',             regexp_replace(v.path, '^.*/', ''),
                        'visitDate',      (v.data ->> 'visitDate')::bigint,
                        'tokenNumber',    (v.data ->> 'tokenNumber')::bigint,
                        'departmentName', v.data ->> 'departmentName',
                        'doctorName',     v.data ->> 'doctorName',
                        'status',         coalesce(v.data ->> 'status', 'booked')
                      )
                 from public.documents v
                where v.facility_id = v_fid
                  and v.collection  = 'facilities/' || v_fid || '/opdVisits'
                  and v.data ->> 'patientId' = regexp_replace(p.path, '^.*/', '')
                order by (v.data ->> 'visitDate')::bigint desc nulls last
                limit 1
             )
           ) as x
      from public.documents p
     where p.facility_id = v_fid
       and p.collection  = 'facilities/' || v_fid || '/patients'
       and coalesce(p.data ->> 'status', 'active') <> 'archived'
       and (
             lower(p.data ->> 'name') like '%' || lower(v_q) || '%'
          or (length(v_digits) >= 4
              and right(regexp_replace(p.data ->> 'phone', '\D', '', 'g'), 10)
                  like '%' || v_digits || '%')
          or upper(coalesce(p.data ->> 'uhid', '')) like '%' || upper(v_q) || '%'
       )
     limit v_limit
  ) s;

  return v_rows;
end; $function$;

revoke all on function public.get_visit_by_token(bigint, date) from public;
revoke all on function public.search_patients(text, int) from public;
-- Supabase's default privileges grant EXECUTE on new public-schema functions
-- to anon *directly*, so revoking from PUBLIC above does not cover it. These
-- are staff-only lookups; revoke anon explicitly.
revoke execute on function public.get_visit_by_token(bigint, date) from anon;
revoke execute on function public.search_patients(text, int) from anon;
grant execute on function public.get_visit_by_token(bigint, date) to authenticated;
grant execute on function public.search_patients(text, int) to authenticated;
