-- Phase 9 — Dashboard Recent Activity Feed
--
-- The dashboard's "Recent Activity" section was a hardcoded empty state.
-- The auditLog collection already exists but querying it via subscribeToCollection
-- would fetch ALL rows and sort in JS. This RPC returns only the last N entries
-- from the facility's auditLog, fast.
--

create or replace function public.hms_recent_activity(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_fid text := public.hms_current_facility_id();
  v_rows jsonb;
begin
  if v_fid is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(r order by (r->>'timestamp')::bigint desc), '[]'::jsonb)
    into v_rows
  from (
    select data || jsonb_build_object('id', regexp_replace(path, '^.*/', '')) as r
      from public.documents
     where collection = 'facilities/' || v_fid || '/auditLog'
     order by (data->>'timestamp')::bigint desc
     limit p_limit
  ) sub;

  return v_rows;
end;
$$;

revoke all on function public.hms_recent_activity(integer) from public, anon;
grant execute on function public.hms_recent_activity(integer) to authenticated;
