-- Tell "this token was never issued" apart from "this token exists but has no
-- visit against it".
--
-- Token lookup could previously only say "no match". Those two cases need
-- different words at a counter: a number above anything issued today is a
-- misread slip, while a number inside the issued range with nothing behind it
-- is a cancelled or deleted visit, which is a records problem.
--
-- This is only answerable because 0022 collapsed token issue to one series per
-- facility per day. While two series ran in parallel there was no single "how
-- far has today got" to compare against.
--
-- issuedUpTo reads the counter directly rather than max(tokenNumber) over the
-- visits: if a visit is deleted, the counter still knows the number was handed
-- out, and that is exactly the case this field exists to detect.
create or replace function public.get_visit_by_token(
  p_token_number bigint,
  p_token_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_fid    text := public.hms_current_facility_id();
  v_date   date := coalesce(p_token_date, (now() at time zone 'Asia/Kolkata')::date);
  v_from   bigint;
  v_to     bigint;
  v_rows   jsonb;
  v_issued bigint;
begin
  if v_fid is null or not public.is_facility_member(v_fid) then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;
  if p_token_number is null then
    raise exception 'TOKEN_REQUIRED';
  end if;

  v_from := (extract(epoch from (v_date::timestamp at time zone 'Asia/Kolkata')) * 1000)::bigint;
  v_to   := (extract(epoch from ((v_date + 1)::timestamp at time zone 'Asia/Kolkata')) * 1000)::bigint;

  select coalesce((data ->> 'value')::bigint, 0) into v_issued
    from public.documents
   where path = 'facilities/' || v_fid || '/counters/opdToken-' || to_char(v_date, 'YYYY-MM-DD');

  select coalesce(jsonb_agg(x order by x ->> 'departmentName' nulls last), '[]'::jsonb)
    into v_rows
  from (
    select jsonb_build_object(
             'id',             regexp_replace(v.path, '^.*/', ''),
             'tokenNumber',    (v.data ->> 'tokenNumber')::bigint,
             'deptRegNo',      v.data ->> 'deptRegNo',
             'status',         coalesce(v.data ->> 'status', 'booked'),
             'verified',       coalesce((v.data ->> 'verified')::boolean, true),
             -- Derived, not read from the needsAssignment flag: rows written
             -- before that flag existed do not carry it, and today's data
             -- already contains a qr_self visit with no departmentId and no
             -- flag. Whether routing is outstanding is answerable from the
             -- fields themselves, so it is answered from them.
             'needsAssignment', (coalesce(v.data ->> 'departmentId', '') = ''
                                 or coalesce(v.data ->> 'doctorId', '') = ''),
             'bookingSource',  coalesce(v.data ->> 'bookingSource', 'counter'),
             'departmentId',   v.data ->> 'departmentId',
             'departmentName', v.data ->> 'departmentName',
             'doctorId',       v.data ->> 'doctorId',
             'doctorName',     v.data ->> 'doctorName',
             'floor',          v.data ->> 'floor',
             'wing',           v.data ->> 'wing',
             'roomNumber',     v.data ->> 'roomNumber',
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
       and coalesce(nullif(v.data ->> 'tokenNumber', ''), '0')::bigint = p_token_number
       and coalesce(nullif(v.data ->> 'visitDate', ''), '0')::bigint >= v_from
       and coalesce(nullif(v.data ->> 'visitDate', ''), '0')::bigint <  v_to
  ) s;

  return jsonb_build_object(
    'tokenNumber', p_token_number,
    'tokenDate',   to_char(v_date, 'YYYY-MM-DD'),
    'issuedUpTo',  coalesce(v_issued, 0),
    'matches',     v_rows
  );
end;
$function$;

revoke all on function public.get_visit_by_token(bigint, date) from public, anon;
grant execute on function public.get_visit_by_token(bigint, date) to authenticated;
