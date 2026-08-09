-- Everything generateSlots() needs for one doctor on one date, in one call.
--
-- No new tables. This project stores every entity as a row in public.documents
-- keyed by path, and the RLS convention is a single permissive policy on that
-- table scoping by facility_id (documents_rw), with restrictive policies layered
-- on for role-gated collections. The two new entities therefore live at:
--
--   facilities/{fid}/doctorAvailability/{id}
--   facilities/{fid}/doctorLeave/{id}
--
-- and inherit facility isolation from the existing policy. Creating separate
-- doctor_availability / doctor_leave tables would have meant writing fresh RLS
-- by hand for each — a second, parallel isolation mechanism to keep correct
-- forever, when the requirement was explicitly to mirror the existing one.
--
-- Rules and leave are small and could be read straight from the client, but
-- booked times cannot: finding the handful of appointments for one doctor on
-- one day by subscribing to the whole opdVisits collection is exactly the
-- pattern countDocuments() and hms_dashboard_stats() exist to avoid. All three
-- are returned together so a date change is one round trip rather than three.
create or replace function public.hms_slot_inputs(
  p_doctor_id text,
  p_date date,
  p_consultation_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_fid    text := public.hms_current_facility_id();
  v_from   bigint;
  v_to     bigint;
  v_rules  jsonb;
  v_leave  jsonb;
  v_booked jsonb;
begin
  if v_fid is null then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;
  if p_doctor_id is null or p_date is null then
    raise exception 'DOCTOR_AND_DATE_REQUIRED';
  end if;

  -- Day boundaries in IST, as everywhere else in this schema. visitDate is
  -- epoch milliseconds; a UTC-based window would put the 05:00-05:30 IST slots
  -- on the previous day and report them as free when they are taken.
  v_from := (extract(epoch from (p_date::timestamp at time zone 'Asia/Kolkata')) * 1000)::bigint;
  v_to   := (extract(epoch from ((p_date + 1)::timestamp at time zone 'Asia/Kolkata')) * 1000)::bigint;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',               regexp_replace(d.path, '^.*/', ''),
           'doctorId',         d.data ->> 'doctorId',
           'consultationType', d.data ->> 'consultationType',
           'locationName',     d.data ->> 'locationName',
           'slotMinutes',      coalesce(nullif(d.data ->> 'slotMinutes', ''), '0')::int,
           'startTime',        d.data ->> 'startTime',
           'endTime',          d.data ->> 'endTime',
           'daysOfWeek',       coalesce(d.data -> 'daysOfWeek', '[]'::jsonb),
           'isActive',         coalesce((d.data ->> 'isActive')::boolean, true)
         )), '[]'::jsonb)
    into v_rules
    from public.documents d
   where d.collection = 'facilities/' || v_fid || '/doctorAvailability'
     and d.data ->> 'doctorId' = p_doctor_id
     and d.data ->> 'consultationType' = p_consultation_type
     and coalesce((d.data ->> 'isActive')::boolean, true) = true;

  -- Overlap test rather than a containment test: a leave range that merely
  -- covers the date is what matters, and the range may start before it and
  -- end after it.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',        regexp_replace(d.path, '^.*/', ''),
           'startDate', d.data ->> 'startDate',
           'endDate',   coalesce(nullif(d.data ->> 'endDate', ''), d.data ->> 'startDate'),
           'reason',    d.data ->> 'reason'
         )), '[]'::jsonb)
    into v_leave
    from public.documents d
   where d.collection = 'facilities/' || v_fid || '/doctorLeave'
     and d.data ->> 'doctorId' = p_doctor_id
     and (d.data ->> 'startDate') <= to_char(p_date, 'YYYY-MM-DD')
     and coalesce(nullif(d.data ->> 'endDate', ''), d.data ->> 'startDate') >= to_char(p_date, 'YYYY-MM-DD');

  -- Start times already taken, as 'HH24:MI' in IST so they compare directly
  -- against the generated slot keys. Cancelled and no-show visits release
  -- their slot; anything still live holds it.
  select coalesce(jsonb_agg(distinct to_char(
           to_timestamp(coalesce(nullif(d.data ->> 'visitDate', ''), '0')::bigint / 1000.0)
             at time zone 'Asia/Kolkata', 'HH24:MI')), '[]'::jsonb)
    into v_booked
    from public.documents d
   where d.collection = 'facilities/' || v_fid || '/opdVisits'
     and d.data ->> 'doctorId' = p_doctor_id
     and coalesce(nullif(d.data ->> 'visitDate', ''), '0')::bigint >= v_from
     and coalesce(nullif(d.data ->> 'visitDate', ''), '0')::bigint <  v_to
     and coalesce(d.data ->> 'status', 'booked') not in ('cancelled', 'no_show');

  return jsonb_build_object(
    'rules',  v_rules,
    'leave',  v_leave,
    'booked', v_booked
  );
end;
$function$;

revoke all on function public.hms_slot_inputs(text, date, text) from public, anon;
grant execute on function public.hms_slot_inputs(text, date, text) to authenticated;
