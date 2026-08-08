-- Server-side consultation fee resolution.
--
-- Previously the OPD consultation fee was resolved in the browser and stamped
-- onto the visit, so anyone able to write the visit document could set an
-- arbitrary fee. The fee is now resolved and stamped by the server from the
-- facility's tariff master, and the client no longer supplies an amount.
--
-- Tariff master lives in the document store at
--   facilities/{fid}/tariffMaster/{id}
-- with shape { category, status, amount, doctorId }.
-- A row with doctorId = null is the facility default.

create or replace function public.get_consultation_fee(
  p_facility_id text,
  p_doctor_id text default null
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Doctor-specific tariff wins.
    (select (d.data ->> 'amount')::numeric
       from documents d
      where d.facility_id = p_facility_id
        and d.collection = 'facilities/' || p_facility_id || '/tariffMaster'
        and d.data ->> 'category' = 'consultation'
        and d.data ->> 'status' = 'active'
        and p_doctor_id is not null
        and d.data ->> 'doctorId' = p_doctor_id
      order by d.updated_at desc
      limit 1),
    -- Otherwise the facility default row (no doctorId).
    (select (d.data ->> 'amount')::numeric
       from documents d
      where d.facility_id = p_facility_id
        and d.collection = 'facilities/' || p_facility_id || '/tariffMaster'
        and d.data ->> 'category' = 'consultation'
        and d.data ->> 'status' = 'active'
        and (d.data ->> 'doctorId') is null
      order by d.updated_at desc
      limit 1),
    0
  );
$$;

-- Completes an OPD visit and stamps the server-resolved fee.
-- The fee is never accepted from the client.
create or replace function public.complete_opd_visit(
  p_path text,
  p_clinical jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      documents%rowtype;
  v_doctor   text;
  v_fee      numeric;
  v_result   jsonb;
begin
  select * into v_row from documents where path = p_path for update;

  if not found then
    raise exception 'VISIT_NOT_FOUND';
  end if;

  -- SECURITY DEFINER bypasses RLS, so re-check facility membership by hand.
  if not is_facility_member(v_row.facility_id) then
    raise exception 'NOT_A_FACILITY_MEMBER';
  end if;

  if v_row.data ->> 'status' = 'completed' then
    raise exception 'VISIT_ALREADY_COMPLETED';
  end if;

  v_doctor := v_row.data ->> 'doctorId';
  v_fee := get_consultation_fee(v_row.facility_id, v_doctor);

  v_result := v_row.data
    || coalesce(p_clinical, '{}'::jsonb)
    || jsonb_build_object(
         'status', 'completed',
         'completedAt', (extract(epoch from now()) * 1000)::bigint,
         'consultationFee', v_fee,
         'billed', false
       );

  update documents
     set data = v_result,
         updated_at = now()
   where path = p_path;

  return v_result;
end;
$$;

revoke all on function public.get_consultation_fee(text, text) from public, anon;
revoke all on function public.complete_opd_visit(text, jsonb) from public, anon;
grant execute on function public.get_consultation_fee(text, text) to authenticated;
grant execute on function public.complete_opd_visit(text, jsonb) to authenticated;
