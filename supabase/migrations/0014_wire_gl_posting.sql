-- Phase 9 (Part A) — wire GL posting into the existing invoice status flow.
--
-- The spec says to fire these at the same points the existing billing RPCs
-- already do, without duplicating logic. There are three such points, not one:
--
--   * create_invoice sets paymentStatus straight to 'paid' for any non-
--     insurance bill, so a cash invoice never passes through record_payment
--     at all. Wiring only record_payment would silently miss every cash sale.
--   * create_invoice also exists as TWO overloads (an 11-arg original and the
--     14-arg manual-invoice version from 0011). Editing one would leave the
--     other posting nothing.
--   * record_payment tips a partially-paid invoice to 'paid' later.
--
-- So the hook is a trigger on the invoice row's status rather than a call
-- edited into each function. One place, covers all three paths, and cannot be
-- bypassed by a future fourth one.
--
-- It fires inside the writer's own transaction on purpose. A payment that is
-- collected but not booked leaves the ledger permanently short against the
-- cash drawer with nothing to ever reconcile it — an accounting engine that
-- can silently skip entries is worse than no engine. If posting raises, the
-- invoice write rolls back with it and the clerk sees the failure.
--
-- Which posting function runs depends on what is being billed: an invoice
-- carrying IPD admissions settles through settle_ipd_discharge_gl, which
-- adjusts outstanding advance deposits first; everything else goes through
-- post_opd_invoice_gl. Both are idempotent, so replays post exactly once.

create or replace function public.hms_post_invoice_gl_on_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admissions jsonb;
begin
  if new.collection not like 'facilities/%/billing' then return new; end if;
  if coalesce(new.data->>'type', '') <> 'invoice' then return new; end if;
  if coalesce(new.data->>'paymentStatus', '') <> 'paid' then return new; end if;

  -- Only on the transition into 'paid'; an ordinary edit to an already-paid
  -- invoice must not re-post.
  if tg_op = 'UPDATE' and coalesce(old.data->>'paymentStatus','') = 'paid' then
    return new;
  end if;

  v_admissions := coalesce(new.data->'sourceAdmissionIds', '[]'::jsonb);
  if jsonb_array_length(v_admissions) > 0 then
    perform public.settle_ipd_discharge_gl(v_admissions->>0, split_part(new.path, '/', 4));
  else
    perform public.post_opd_invoice_gl(split_part(new.path, '/', 4));
  end if;

  return new;
end; $function$;

drop trigger if exists documents_invoice_gl on public.documents;
create trigger documents_invoice_gl
  after insert or update on public.documents
  for each row
  execute function public.hms_post_invoice_gl_on_paid();
