-- Phase 9 (Part A) — Double-entry accounting engine.
--
-- ---------------------------------------------------------------------------
-- Deviations from the spec, and why
-- ---------------------------------------------------------------------------
-- The spec asks for three new relational tables (chart_of_accounts,
-- general_ledger_entries, patient_advance_deposits) with FKs to `patients`,
-- `invoices`, `ipd_admissions` and `doctor_revenue_shares`. None of those
-- tables exist. This app stores every tenant record as one row in the single
-- `public.documents` JSONB store, keyed by path — that is what RLS, the
-- realtime subscriptions and every module's data layer are built on. So:
--
--   * chart_of_accounts IS created as a real table. Account codes are fixed
--     accounting reference data, identical for every tenant and never written
--     by the app, so it does not belong in the tenant document store.
--
--   * The ledger and deposits live in `documents`, at
--       facilities/{fid}/accounting/ledger/{id}
--       facilities/{fid}/accounting/deposits/{id}
--     This is not a shortcut: it is what makes them tenant-scoped and
--     RLS-protected for free, and readable by the existing subscribe/query
--     helpers with no new data layer.
--
--   * The spec's row shape (one debit_account_id + one credit_account_id per
--     row) cannot express a three-way split such as a TPA settlement, which
--     debits bank, TDS and disallowance against a single credit. Each voucher
--     instead carries a `lines` array of {accountCode, dr, cr}. The balance
--     rule the spec asks for is unchanged and is enforced harder: every
--     voucher goes through one helper that refuses to write unless
--     SUM(dr) = SUM(cr).
--
-- Immutability is enforced by a trigger, not by RLS. The `documents` RLS
-- policies are broad by design (any facility member may write their own
-- tenant's rows), so a policy alone would not stop a ledger row being edited
-- through the ordinary document API. The trigger blocks UPDATE and DELETE on
-- the ledger collection outright — corrections go through a reversal voucher.

-- ---------------------------------------------------------------------------
-- A1. Chart of accounts
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.account_type as enum ('ASSET','LIABILITY','REVENUE','EXPENSE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.normal_balance as enum ('DR','CR');
exception when duplicate_object then null; end $$;

create table if not exists public.chart_of_accounts (
  account_code   text primary key,
  account_name   text not null,
  account_type   public.account_type not null,
  normal_balance public.normal_balance not null,
  is_active      boolean not null default true
);

insert into public.chart_of_accounts (account_code, account_name, account_type, normal_balance) values
  ('1010', 'Bank/Cash A/c',                    'ASSET',     'DR'),
  ('1210', 'TPA/Insurance Receivable',         'ASSET',     'DR'),
  ('1310', 'TDS Receivable',                   'ASSET',     'DR'),
  ('2110', 'Patient Advance Deposit Liability','LIABILITY', 'CR'),
  ('2210', 'Visiting Doctor Payout Payable',   'LIABILITY', 'CR'),
  ('3010', 'OPD Consultation Revenue',         'REVENUE',   'CR'),
  ('3030', 'Diagnostic Lab Revenue',           'REVENUE',   'CR'),
  ('3050', 'IPD Room & Bed Charges Revenue',   'REVENUE',   'CR'),
  ('3060', 'OT & Surgical Revenue',            'REVENUE',   'CR'),
  ('3070', 'Inpatient Pharmacy Sales Revenue', 'REVENUE',   'CR'),
  ('4010', 'Doctor Revenue Share Expense',     'EXPENSE',   'DR'),
  ('4210', 'TPA Disallowance/Concession Expense','EXPENSE', 'DR')
on conflict (account_code) do update
  set account_name   = excluded.account_name,
      account_type   = excluded.account_type,
      normal_balance = excluded.normal_balance;

alter table public.chart_of_accounts enable row level security;

drop policy if exists coa_read on public.chart_of_accounts;
create policy coa_read on public.chart_of_accounts
  for select to authenticated using (true);

revoke all on public.chart_of_accounts from anon;
grant select on public.chart_of_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- Ledger immutability
-- ---------------------------------------------------------------------------

create or replace function public.hms_block_ledger_mutation()
returns trigger
language plpgsql
as $function$
begin
  -- Correct a posted voucher with a reversal voucher, never by editing it.
  raise exception 'LEDGER_IMMUTABLE: general ledger vouchers cannot be % once posted', lower(tg_op);
end; $function$;

drop trigger if exists documents_ledger_immutable on public.documents;
create trigger documents_ledger_immutable
  before update or delete on public.documents
  for each row
  when (old.collection like 'facilities/%/accounting/ledger')
  execute function public.hms_block_ledger_mutation();

-- ---------------------------------------------------------------------------
-- A2. Voucher posting helper
-- ---------------------------------------------------------------------------
-- Every RPC below posts through this one function, so the balance rule, the
-- voucher numbering and the idempotency guard exist in exactly one place.
--
-- p_lines: [{"accountCode":"1010","dr":500,"cr":0}, ...]
--
-- Idempotency matters because these are wired into status-change flows that
-- can fire more than once (a retried click, a payment that tips an invoice to
-- 'paid' twice). Re-posting the same source returns the existing voucher
-- instead of duplicating revenue.

create or replace function public.hms_post_voucher(
  p_source_type text,
  p_source_id   text,
  p_narration   text,
  p_lines       jsonb,
  p_patient_id  text default null,
  p_voucher_date bigint default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid   text := public.hms_current_facility_id();
  v_line  jsonb;
  v_dr    numeric := 0;
  v_cr    numeric := 0;
  v_code  text;
  v_seq   bigint;
  v_year  text;
  v_no    text;
  v_id    text;
  v_now   bigint := (extract(epoch from now()) * 1000)::bigint;
  v_date  bigint;
  v_doc   jsonb;
  v_existing jsonb;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;
  v_date := coalesce(p_voucher_date, v_now);

  -- Already posted for this source? Hand back what is there.
  select d.data into v_existing
    from public.documents d
   where d.collection = 'facilities/'||v_fid||'/accounting/ledger'
     and d.data->>'sourceType' = p_source_type
     and d.data->>'sourceId'   = p_source_id
   limit 1;
  if v_existing is not null then
    return v_existing || jsonb_build_object('alreadyPosted', true);
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'VOUCHER_EMPTY: a voucher needs at least one line';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_code := v_line->>'accountCode';
    if not exists (
      select 1 from public.chart_of_accounts
       where account_code = v_code and is_active
    ) then
      raise exception 'UNKNOWN_ACCOUNT: %', coalesce(v_code, 'null');
    end if;
    if coalesce((v_line->>'dr')::numeric, 0) < 0
       or coalesce((v_line->>'cr')::numeric, 0) < 0 then
      raise exception 'NEGATIVE_AMOUNT: voucher lines must be positive; reverse the sides instead';
    end if;
    v_dr := v_dr + coalesce((v_line->>'dr')::numeric, 0);
    v_cr := v_cr + coalesce((v_line->>'cr')::numeric, 0);
  end loop;

  -- Rounded to paise: numeric arithmetic on split revenue can leave a
  -- sub-paise residue that is not a real imbalance.
  if round(v_dr, 2) <> round(v_cr, 2) then
    raise exception 'VOUCHER_UNBALANCED: debits % <> credits %', round(v_dr,2), round(v_cr,2);
  end if;
  if round(v_dr, 2) = 0 then
    raise exception 'VOUCHER_ZERO: refusing to post a zero-value voucher';
  end if;

  v_year := to_char(to_timestamp(v_date / 1000.0) at time zone 'Asia/Kolkata', 'YYYY');
  v_seq  := public.increment_counter(
              'facilities/'||v_fid||'/counters/voucher-'||v_year, 'value');
  v_no   := 'JV-'||v_year||'-'||lpad(v_seq::text, 6, '0');
  v_id   := 'jv'||v_now::text||floor(random()*1000)::text;

  v_doc := jsonb_build_object(
    'type',          'voucher',
    'voucherNumber', v_no,
    'voucherDate',   v_date,
    'lines',         p_lines,
    'amount',        round(v_dr, 2),
    'narration',     p_narration,
    'sourceType',    p_source_type,
    'sourceId',      p_source_id,
    'patientId',     p_patient_id,
    'createdBy',     auth.uid(),
    'createdByRole', public.hms_current_role(),
    'createdAt',     v_now
  );

  insert into public.documents (path, collection, facility_id, data)
  values ('facilities/'||v_fid||'/accounting/ledger/'||v_id,
          'facilities/'||v_fid||'/accounting/ledger',
          v_fid, v_doc);

  return v_doc;
end; $function$;

-- Maps a bill line's source to the revenue account it belongs in. Kept as a
-- function so OPD posting and IPD discharge posting cannot drift apart.
create or replace function public.hms_revenue_account(p_source text)
returns text
language sql
immutable
as $function$
  select case lower(coalesce(p_source, ''))
    when 'opd'      then '3010'
    when 'lab'      then '3030'
    when 'ipd'      then '3050'
    when 'ot'       then '3060'
    when 'surgery'  then '3060'
    when 'pharmacy' then '3070'
    else '3010'   -- manual / walk-in charges bill as OPD revenue
  end;
$function$;

-- ---------------------------------------------------------------------------
-- A2.1 record_advance_deposit
--   Dr 1010 Bank/Cash · Cr 2110 Patient Advance Deposit Liability
-- Money taken before treatment is a liability, never revenue — it is only
-- recognised as income when it is adjusted against a bill at discharge.
-- ---------------------------------------------------------------------------

create or replace function public.record_advance_deposit(
  p_patient_id text,
  p_amount     numeric,
  p_mode       text,
  p_admission_id text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid  text := public.hms_current_facility_id();
  v_role text := public.hms_current_role();
  v_now  bigint := (extract(epoch from now()) * 1000)::bigint;
  v_id   text;
  v_patient jsonb;
  v_voucher jsonb;
  v_dep jsonb;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;
  if v_role not in ('billing_staff','facility_admin','super_admin') then
    raise exception 'ROLE_NOT_PERMITTED: % cannot take deposits', coalesce(v_role,'none');
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'INVALID_AMOUNT: deposit must be greater than zero';
  end if;
  if p_mode not in ('cash','upi','card','bank_transfer') then
    raise exception 'INVALID_MODE: %', coalesce(p_mode,'null');
  end if;

  select d.data into v_patient from public.documents d
   where d.path = 'facilities/'||v_fid||'/patients/'||p_patient_id;
  if v_patient is null then raise exception 'PATIENT_NOT_FOUND: %', p_patient_id; end if;

  v_id := 'dep'||v_now::text||floor(random()*1000)::text;

  v_voucher := public.hms_post_voucher(
    'ADVANCE_DEPOSIT', v_id,
    'Advance deposit received from '||coalesce(v_patient->>'name','patient')
      ||' ('||coalesce(v_patient->>'uhid','no UHID')||') via '||p_mode,
    jsonb_build_array(
      jsonb_build_object('accountCode','1010','dr',p_amount,'cr',0),
      jsonb_build_object('accountCode','2110','dr',0,'cr',p_amount)
    ),
    p_patient_id);

  v_dep := jsonb_build_object(
    'type',            'advance_deposit',
    'patientId',       p_patient_id,
    'patientName',     v_patient->>'name',
    'patientUhid',     v_patient->>'uhid',
    'admissionId',     p_admission_id,
    'amount',          p_amount,
    'balanceRemaining',p_amount,
    'depositMode',     p_mode,
    'voucherNumber',   v_voucher->>'voucherNumber',
    'receiptNumber',   'AD-'||to_char(to_timestamp(v_now/1000.0) at time zone 'Asia/Kolkata','YYYY')
                        ||'-'||lpad((public.increment_counter(
                             'facilities/'||v_fid||'/counters/deposit-'
                             ||to_char(to_timestamp(v_now/1000.0) at time zone 'Asia/Kolkata','YYYY'),
                             'value'))::text, 5, '0'),
    'receivedByRole',  v_role,
    'createdAt',       v_now,
    'updatedAt',       v_now
  );

  insert into public.documents (path, collection, facility_id, data)
  values ('facilities/'||v_fid||'/accounting/deposits/'||v_id,
          'facilities/'||v_fid||'/accounting/deposits', v_fid, v_dep);

  return v_dep || jsonb_build_object('id', v_id);
end; $function$;

-- ---------------------------------------------------------------------------
-- A2.2 post_opd_invoice_gl
--   Dr 1010 Bank/Cash · Cr 3010 / 3030 / ... split by line-item source
-- ---------------------------------------------------------------------------

create or replace function public.post_opd_invoice_gl(p_invoice_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid text := public.hms_current_facility_id();
  v_inv jsonb;
  v_total numeric;
  v_lines jsonb;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;

  select d.data into v_inv from public.documents d
   where d.path = 'facilities/'||v_fid||'/billing/'||p_invoice_id;
  if v_inv is null then raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id; end if;

  -- Cash accounting: revenue is recognised on money actually received, so an
  -- unpaid or partly-paid invoice has nothing to post yet.
  v_total := coalesce((v_inv->>'paidAmount')::numeric, 0);
  if v_total <= 0 then
    return jsonb_build_object('posted', false, 'reason', 'NO_PAYMENT_RECEIVED');
  end if;

  -- Split the received amount across revenue accounts in proportion to the
  -- line items, then force the largest slice to absorb any rounding residue
  -- so the voucher balances to the paise.
  with items as (
    select public.hms_revenue_account(li->>'source') as acct,
           sum(coalesce((li->>'amount')::numeric, 0)) as amt
      from jsonb_array_elements(coalesce(v_inv->'lineItems', '[]'::jsonb)) li
     group by 1
    having sum(coalesce((li->>'amount')::numeric, 0)) > 0
  ),
  scaled as (
    select acct,
           round(v_total * amt / nullif(sum(amt) over (), 0), 2) as amt,
           row_number() over (order by amt desc) as rn
      from items
  ),
  fixed as (
    select acct,
           case when rn = 1
                then amt + (v_total - sum(amt) over ())
                else amt end as amt
      from scaled
  )
  select jsonb_agg(jsonb_build_object('accountCode', acct, 'dr', 0, 'cr', amt))
    into v_lines
    from fixed where amt > 0;

  if v_lines is null then
    -- No line items to attribute — book it all to OPD consultation revenue.
    v_lines := jsonb_build_array(jsonb_build_object('accountCode','3010','dr',0,'cr',v_total));
  end if;

  return public.hms_post_voucher(
    'OPD_INVOICE', p_invoice_id,
    'Revenue on invoice '||coalesce(v_inv->>'invoiceNumber', p_invoice_id)
      ||' — '||coalesce(v_inv->>'patientName','patient'),
    jsonb_build_array(jsonb_build_object('accountCode','1010','dr',v_total,'cr',0)) || v_lines,
    v_inv->>'patientId',
    coalesce((v_inv->>'invoiceDate')::bigint, null));
end; $function$;

-- ---------------------------------------------------------------------------
-- A2.3 settle_ipd_discharge_gl
--   Dr 2110 advance (capped at what is actually left on deposit)
--   Dr 1010 bank for the rest actually collected
--   Cr 3050 / 3060 / 3070 split per line item
-- ---------------------------------------------------------------------------

create or replace function public.settle_ipd_discharge_gl(
  p_admission_id text,
  p_invoice_id   text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid text := public.hms_current_facility_id();
  v_inv jsonb;
  v_total numeric;
  v_advance numeric := 0;
  v_take numeric;
  v_left numeric;
  v_cash numeric;
  v_lines jsonb;
  v_debits jsonb := '[]'::jsonb;
  v_dep record;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;

  select d.data into v_inv from public.documents d
   where d.path = 'facilities/'||v_fid||'/billing/'||p_invoice_id;
  if v_inv is null then raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id; end if;

  v_total := coalesce((v_inv->>'paidAmount')::numeric, 0);
  if v_total <= 0 then
    return jsonb_build_object('posted', false, 'reason', 'NO_PAYMENT_RECEIVED');
  end if;

  -- Consume deposits oldest-first, under a row lock so a second discharge
  -- click cannot spend the same advance twice.
  v_left := v_total;
  for v_dep in
    select d.path, d.data from public.documents d
     where d.collection = 'facilities/'||v_fid||'/accounting/deposits'
       and d.data->>'patientId' = (v_inv->>'patientId')
       and coalesce((d.data->>'balanceRemaining')::numeric, 0) > 0
     order by (d.data->>'createdAt')::bigint
     for update
  loop
    exit when v_left <= 0;
    v_take := least(coalesce((v_dep.data->>'balanceRemaining')::numeric, 0), v_left);
    update public.documents
       set data = data || jsonb_build_object(
             'balanceRemaining', coalesce((data->>'balanceRemaining')::numeric,0) - v_take,
             'updatedAt', v_now),
           updated_at = now()
     where path = v_dep.path;
    v_advance := v_advance + v_take;
    v_left := v_left - v_take;
  end loop;

  v_cash := v_total - v_advance;

  if v_advance > 0 then
    v_debits := v_debits || jsonb_build_array(
      jsonb_build_object('accountCode','2110','dr',v_advance,'cr',0));
  end if;
  if v_cash > 0 then
    v_debits := v_debits || jsonb_build_array(
      jsonb_build_object('accountCode','1010','dr',v_cash,'cr',0));
  end if;

  with items as (
    select public.hms_revenue_account(li->>'source') as acct,
           sum(coalesce((li->>'amount')::numeric, 0)) as amt
      from jsonb_array_elements(coalesce(v_inv->'lineItems', '[]'::jsonb)) li
     group by 1
    having sum(coalesce((li->>'amount')::numeric, 0)) > 0
  ),
  scaled as (
    select acct, round(v_total * amt / nullif(sum(amt) over (), 0), 2) as amt,
           row_number() over (order by amt desc) as rn
      from items
  ),
  fixed as (
    select acct,
           case when rn = 1 then amt + (v_total - sum(amt) over ()) else amt end as amt
      from scaled
  )
  select jsonb_agg(jsonb_build_object('accountCode', acct, 'dr', 0, 'cr', amt))
    into v_lines from fixed where amt > 0;

  if v_lines is null then
    v_lines := jsonb_build_array(jsonb_build_object('accountCode','3050','dr',0,'cr',v_total));
  end if;

  return public.hms_post_voucher(
    'IPD_DISCHARGE', p_admission_id,
    'Discharge settlement — invoice '||coalesce(v_inv->>'invoiceNumber', p_invoice_id)
      ||', advance adjusted '||v_advance::text||', collected '||v_cash::text,
    v_debits || v_lines,
    v_inv->>'patientId');
end; $function$;

-- ---------------------------------------------------------------------------
-- A2.4 settle_tpa_claim_gl
--   Dr 1010 net · Dr 1310 TDS · Dr 4210 disallowed · Cr 1210 receivable
-- ---------------------------------------------------------------------------

create or replace function public.settle_tpa_claim_gl(
  p_invoice_id       text,
  p_net_received     numeric,
  p_tds_amount       numeric default 0,
  p_disallowed_amount numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid text := public.hms_current_facility_id();
  v_role text := public.hms_current_role();
  v_inv jsonb;
  v_claim numeric;
  v_sum numeric;
  v_lines jsonb;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;
  if v_role not in ('billing_staff','facility_admin','super_admin') then
    raise exception 'ROLE_NOT_PERMITTED: % cannot settle claims', coalesce(v_role,'none');
  end if;

  select d.data into v_inv from public.documents d
   where d.path = 'facilities/'||v_fid||'/billing/'||p_invoice_id;
  if v_inv is null then raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id; end if;

  v_claim := coalesce((v_inv->'insuranceClaim'->>'claimAmount')::numeric,
                      (v_inv->>'total')::numeric, 0);
  if v_claim <= 0 then raise exception 'NO_CLAIM_AMOUNT on invoice %', p_invoice_id; end if;

  v_sum := coalesce(p_net_received,0) + coalesce(p_tds_amount,0) + coalesce(p_disallowed_amount,0);
  -- The three buckets must account for the whole claim, otherwise the
  -- receivable would be cleared for money nobody has explained.
  if round(v_sum, 2) <> round(v_claim, 2) then
    raise exception 'CLAIM_MISMATCH: net+TDS+disallowed (%) <> claim amount (%)',
      round(v_sum,2), round(v_claim,2);
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('accountCode','1210','dr',0,'cr',v_claim));
  if coalesce(p_net_received,0) > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('accountCode','1010','dr',p_net_received,'cr',0)) || v_lines;
  end if;
  if coalesce(p_tds_amount,0) > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('accountCode','1310','dr',p_tds_amount,'cr',0)) || v_lines;
  end if;
  if coalesce(p_disallowed_amount,0) > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('accountCode','4210','dr',p_disallowed_amount,'cr',0)) || v_lines;
  end if;

  return public.hms_post_voucher(
    'TPA_SETTLEMENT', p_invoice_id,
    'TPA settlement of claim '||coalesce(v_inv->'insuranceClaim'->>'claimNumber', p_invoice_id)
      ||' — received '||coalesce(p_net_received,0)::text
      ||', TDS '||coalesce(p_tds_amount,0)::text
      ||', disallowed '||coalesce(p_disallowed_amount,0)::text,
    v_lines,
    v_inv->>'patientId');
end; $function$;

-- ---------------------------------------------------------------------------
-- A2.5 accrue_doctor_revenue_share_gl
--   Dr 4010 Doctor Revenue Share Expense · Cr 2210 Payout Payable
--
-- The spec reads the share % from a `doctor_revenue_shares` table. There is
-- no such table; the percentage lives on the doctor's own staff record as
-- `revenueSharePercent`, which is where the staff module already edits it.
-- ---------------------------------------------------------------------------

create or replace function public.accrue_doctor_revenue_share_gl(
  p_invoice_id text,
  p_doctor_id  text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid text := public.hms_current_facility_id();
  v_inv jsonb;
  v_doc jsonb;
  v_pct numeric;
  v_base numeric;
  v_amt numeric;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;

  select d.data into v_inv from public.documents d
   where d.path = 'facilities/'||v_fid||'/billing/'||p_invoice_id;
  if v_inv is null then raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id; end if;

  select d.data into v_doc from public.documents d
   where d.collection = 'facilities/'||v_fid||'/staff'
     and (d.path = 'facilities/'||v_fid||'/staff/'||p_doctor_id
          or d.data->>'staffId' = p_doctor_id)
   limit 1;
  if v_doc is null then raise exception 'DOCTOR_NOT_FOUND: %', p_doctor_id; end if;

  v_pct := coalesce((v_doc->>'revenueSharePercent')::numeric, 0);
  if v_pct <= 0 then
    -- A salaried doctor has no share. Not an error, just nothing to accrue.
    return jsonb_build_object('posted', false, 'reason', 'NO_REVENUE_SHARE_CONFIGURED');
  end if;
  if v_pct > 100 then raise exception 'INVALID_SHARE_PERCENT: %', v_pct; end if;

  v_base := coalesce((v_inv->>'total')::numeric, (v_inv->>'grandTotal')::numeric, 0);
  v_amt := round(v_base * v_pct / 100.0, 2);
  if v_amt <= 0 then
    return jsonb_build_object('posted', false, 'reason', 'ZERO_SHARE_AMOUNT');
  end if;

  return public.hms_post_voucher(
    'DOCTOR_SHARE', p_invoice_id||':'||p_doctor_id,
    'Revenue share '||v_pct::text||'% to Dr. '||coalesce(v_doc->>'name','doctor')
      ||' on invoice '||coalesce(v_inv->>'invoiceNumber', p_invoice_id),
    jsonb_build_array(
      jsonb_build_object('accountCode','4010','dr',v_amt,'cr',0),
      jsonb_build_object('accountCode','2210','dr',0,'cr',v_amt)
    ),
    v_inv->>'patientId');
end; $function$;

-- ---------------------------------------------------------------------------
-- A3. Reporting views (security_invoker — RLS on `documents` scopes them)
-- ---------------------------------------------------------------------------

create or replace view public.v_ledger_lines
with (security_invoker = true) as
select d.facility_id,
       d.data->>'voucherNumber'            as voucher_number,
       (d.data->>'voucherDate')::bigint    as voucher_date,
       d.data->>'sourceType'               as source_type,
       d.data->>'sourceId'                 as source_id,
       d.data->>'patientId'                as patient_id,
       d.data->>'narration'                as narration,
       l->>'accountCode'                   as account_code,
       coalesce((l->>'dr')::numeric, 0)    as debit,
       coalesce((l->>'cr')::numeric, 0)    as credit
  from public.documents d
  cross join lateral jsonb_array_elements(coalesce(d.data->'lines','[]'::jsonb)) l
 where d.collection like 'facilities/%/accounting/ledger';

create or replace view public.v_trial_balance
with (security_invoker = true) as
select v.facility_id,
       v.account_code,
       c.account_name,
       c.account_type,
       c.normal_balance,
       sum(v.debit)  as total_debit,
       sum(v.credit) as total_credit,
       case when c.normal_balance = 'DR'
            then sum(v.debit) - sum(v.credit)
            else sum(v.credit) - sum(v.debit)
       end as balance
  from public.v_ledger_lines v
  join public.chart_of_accounts c on c.account_code = v.account_code
 group by v.facility_id, v.account_code, c.account_name, c.account_type, c.normal_balance;

create or replace view public.v_ledger_by_patient
with (security_invoker = true) as
select v.facility_id,
       v.patient_id,
       p.data->>'name' as patient_name,
       p.data->>'uhid' as patient_uhid,
       v.voucher_number,
       v.voucher_date,
       v.source_type,
       v.narration,
       v.account_code,
       c.account_name,
       v.debit,
       v.credit
  from public.v_ledger_lines v
  join public.chart_of_accounts c on c.account_code = v.account_code
  left join public.documents p
         on p.path = 'facilities/'||v.facility_id||'/patients/'||v.patient_id
 where v.patient_id is not null;

-- A4. A standing assertion rather than a one-off test: this view must always
-- be empty. Any row in it is an unbalanced voucher that reached the ledger.
create or replace view public.v_voucher_balance_check
with (security_invoker = true) as
select facility_id, voucher_number,
       sum(debit) as total_debit, sum(credit) as total_credit
  from public.v_ledger_lines
 group by facility_id, voucher_number
having round(sum(debit), 2) <> round(sum(credit), 2);

revoke all on public.v_ledger_lines, public.v_trial_balance,
              public.v_ledger_by_patient, public.v_voucher_balance_check from anon;
grant select on public.v_ledger_lines, public.v_trial_balance,
                public.v_ledger_by_patient, public.v_voucher_balance_check to authenticated;

-- ---------------------------------------------------------------------------
-- Grants — anon must be revoked explicitly. Supabase's default privileges
-- grant EXECUTE on new public-schema functions to `anon` directly, so
-- revoking from PUBLIC does not cover it.
-- ---------------------------------------------------------------------------

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('hms_post_voucher','hms_revenue_account',
                         'record_advance_deposit','post_opd_invoice_gl',
                         'settle_ipd_discharge_gl','settle_tpa_claim_gl',
                         'accrue_doctor_revenue_share_gl')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke execute on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- hms_post_voucher is an internal primitive: exposing it would let any staff
-- member write arbitrary balanced journal entries, bypassing every rule the
-- five business RPCs enforce.
revoke execute on function public.hms_post_voucher(text, text, text, jsonb, text, bigint)
  from authenticated;

create index if not exists documents_ledger_source_idx
  on public.documents (facility_id, (data->>'sourceType'), (data->>'sourceId'))
  where collection like 'facilities/%/accounting/ledger';
