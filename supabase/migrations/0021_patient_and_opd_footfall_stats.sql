-- Patient registration and OPD footfall counts for the dashboard cards and the
-- OPD header widget.
--
-- Counted in Postgres rather than the browser for the same reason
-- countDocuments() exists: rendering "1,842 patients" must not cost the client
-- 1,842 rows. Every bucket here is a count(*) against an indexed path prefix.
--
-- Two different questions, deliberately not merged:
--
--   patients.* counts REGISTRATIONS  — data.createdAt on facilities/{fid}/patients
--   opd.*      counts VISITS         — data.visitDate on facilities/{fid}/opdVisits
--
-- A patient registered in 2024 who walks in today is one OPD visit and zero
-- new registrations. Collapsing these into "patients today" would double-count
-- the register and undercount the footfall.
--
-- Field choice for OPD is visitDate, not createdAt: visitDate is the clinical
-- date the visit is FOR, which is what a queue board and a footfall card mean
-- by "today". createdAt is when the row was typed, and an appointment booked
-- on Monday for Thursday would otherwise be counted on Monday. Existing rows
-- confirm visitDate is already stored IST-midnight aligned (e.g.
-- 1785897000000 = 2026-08-05 00:00 IST).
--
-- Both columns are epoch milliseconds (jsonb number), so there is no
-- timezone-aware/naive question at rest — an epoch is an absolute instant. The
-- timezone problem is entirely in the BOUNDARIES, which is where it is solved:
-- every cutoff below is date_trunc'd in Asia/Kolkata and converted back to
-- epoch ms. UTC midnight is 05:30 IST, so a UTC-based "today" would drop the
-- whole morning OPD into yesterday.

create or replace function public.hms_patient_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_fid         text := public.hms_current_facility_id();
  v_now_ist     timestamp;
  v_day_start   bigint;
  v_week_start  bigint;
  v_month_start bigint;
  v_pat_coll    text;
  v_opd_coll    text;
  v_p_today     bigint;
  v_p_week      bigint;
  v_p_month     bigint;
  v_p_total     bigint;
  v_o_today     bigint;
  v_o_week      bigint;
  v_o_month     bigint;
  v_o_total     bigint;
begin
  -- No facility on the session means no answer, not zero. The caller renders
  -- "—" for null; a confident 0 would read as "this hospital saw nobody".
  if v_fid is null then
    return null;
  end if;

  v_now_ist := now() at time zone 'Asia/Kolkata';

  -- date_trunc('week') is Monday-based in Postgres, which is the Mon–Sun week
  -- the wards and the front desk already work to.
  v_day_start   := (extract(epoch from (date_trunc('day',   v_now_ist) at time zone 'Asia/Kolkata')) * 1000)::bigint;
  v_week_start  := (extract(epoch from (date_trunc('week',  v_now_ist) at time zone 'Asia/Kolkata')) * 1000)::bigint;
  v_month_start := (extract(epoch from (date_trunc('month', v_now_ist) at time zone 'Asia/Kolkata')) * 1000)::bigint;

  v_pat_coll := 'facilities/' || v_fid || '/patients';
  v_opd_coll := 'facilities/' || v_fid || '/opdVisits';

  -- There is no upper bound on any bucket. "This month" runs to now, and a
  -- registration cannot be in the future, so a closing cutoff would only add a
  -- way to be wrong at the month boundary.
  --
  -- nullif guards a missing or empty key: '' ::bigint raises, and one legacy
  -- row without createdAt would take the whole card down.
  select
    count(*) filter (where coalesce(nullif(data ->> 'createdAt', ''), '0')::bigint >= v_day_start),
    count(*) filter (where coalesce(nullif(data ->> 'createdAt', ''), '0')::bigint >= v_week_start),
    count(*) filter (where coalesce(nullif(data ->> 'createdAt', ''), '0')::bigint >= v_month_start),
    count(*)
  into v_p_today, v_p_week, v_p_month, v_p_total
  from public.documents
  where collection = v_pat_coll;

  -- Cancelled visits are excluded everywhere, including the all-time total, so
  -- the toggle on the OPD widget cannot make the number jump for a reason that
  -- has nothing to do with the range. Matches hms_dashboard_stats().opdToday.
  select
    count(*) filter (where coalesce(nullif(data ->> 'visitDate', ''), '0')::bigint >= v_day_start),
    count(*) filter (where coalesce(nullif(data ->> 'visitDate', ''), '0')::bigint >= v_week_start),
    count(*) filter (where coalesce(nullif(data ->> 'visitDate', ''), '0')::bigint >= v_month_start),
    count(*)
  into v_o_today, v_o_week, v_o_month, v_o_total
  from public.documents
  where collection = v_opd_coll
    and coalesce(data ->> 'status', 'booked') <> 'cancelled';

  return jsonb_build_object(
    'patients', jsonb_build_object(
      'today', v_p_today, 'week', v_p_week, 'month', v_p_month, 'total', v_p_total),
    'opd', jsonb_build_object(
      'today', v_o_today, 'week', v_o_week, 'month', v_o_month, 'total', v_o_total)
  );
end;
$function$;

-- ALTER DEFAULT PRIVILEGES on this project grants EXECUTE on new public
-- functions to anon directly, so REVOKE ... FROM PUBLIC alone leaves anon
-- holding its own grant. anon must be named explicitly.
revoke all on function public.hms_patient_stats() from public, anon;
grant execute on function public.hms_patient_stats() to authenticated;
