-- Phase 6 (Lab / Diagnostics) — server-enforced status machine.
--
-- This project stores lab orders in the JSONB `documents` store
-- (path: facilities/{fid}/lab/orders/{orderId}), NOT in a dedicated
-- lab_orders table. This function is the single authority for advancing a
-- lab order's status, so the forward-only flow and the "ready needs a
-- result" rule are enforced in the database, not just the UI.
--
-- Flow (immediate successor only, no skips, no going backward):
--   ordered -> sample_collected -> in_progress -> report_ready
--
-- Rules:
--   * caller must be authenticated and a member of the order's facility
--   * moving to report_ready requires either a non-empty results array
--     (structured tests) OR a report file URL (imaging/PDF tests)
--   * sample_collected stamps collectedAt/collectedBy automatically
--   * report_ready stamps reportedAt/reportedByUid and stores results/file

create or replace function public.update_lab_order_status(
  p_path text,
  p_next_status text,
  p_results jsonb default null,
  p_report_file_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.documents;
  v_current text;
  v_flow text[] := array['ordered','sample_collected','in_progress','report_ready'];
  v_cur_idx int;
  v_next_idx int;
  v_data jsonb;
  v_uid text := auth.uid()::text;
  v_now bigint := (extract(epoch from now())*1000)::bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_row from public.documents where path = p_path;
  if not found then
    raise exception 'ORDER_NOT_FOUND: %', p_path;
  end if;

  -- SECURITY DEFINER bypasses RLS, so enforce tenant membership explicitly.
  if not public.is_facility_member(v_row.facility_id) then
    raise exception 'NOT_FACILITY_MEMBER';
  end if;

  v_data := v_row.data;
  v_current := v_data->>'status';
  v_cur_idx := array_position(v_flow, v_current);
  v_next_idx := array_position(v_flow, p_next_status);

  if v_next_idx is null then
    raise exception 'INVALID_STATUS: %', p_next_status;
  end if;
  if v_cur_idx is null then
    raise exception 'UNKNOWN_CURRENT_STATUS: %', v_current;
  end if;
  if v_next_idx <> v_cur_idx + 1 then
    raise exception 'ILLEGAL_TRANSITION: % -> %', v_current, p_next_status;
  end if;

  if p_next_status = 'report_ready' then
    if not (
      (p_results is not null and jsonb_typeof(p_results) = 'array' and jsonb_array_length(p_results) > 0)
      or (coalesce(p_report_file_url,'') <> '')
    ) then
      raise exception 'READY_REQUIRES_RESULTS_OR_FILE';
    end if;
  end if;

  v_data := jsonb_set(v_data, '{status}', to_jsonb(p_next_status));
  v_data := jsonb_set(v_data, array['statusTimestamps', p_next_status], to_jsonb(v_now), true);
  v_data := jsonb_set(v_data, '{updatedAt}', to_jsonb(v_now));

  if p_next_status = 'sample_collected' then
    v_data := jsonb_set(v_data, '{collectedAt}', to_jsonb(v_now), true);
    v_data := jsonb_set(v_data, '{collectedBy}', to_jsonb(v_uid), true);
  end if;

  if p_next_status = 'report_ready' then
    if p_results is not null then
      v_data := jsonb_set(v_data, '{items}', p_results, true);
    end if;
    if coalesce(p_report_file_url,'') <> '' then
      v_data := jsonb_set(v_data, '{reportFileUrl}', to_jsonb(p_report_file_url), true);
    end if;
    v_data := jsonb_set(v_data, '{reportedAt}', to_jsonb(v_now), true);
    v_data := jsonb_set(v_data, '{reportedByUid}', to_jsonb(v_uid), true);
  end if;

  update public.documents set data = v_data where path = p_path;
  return v_data;
end;
$fn$;

revoke all on function public.update_lab_order_status(text,text,jsonb,text) from public;
revoke all on function public.update_lab_order_status(text,text,jsonb,text) from anon;
grant execute on function public.update_lab_order_status(text,text,jsonb,text) to authenticated;
