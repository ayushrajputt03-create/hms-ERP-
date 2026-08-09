-- Accounts module — operating expenses and payroll.
--
-- The School ERP kept expenses, salary and "accounts" as three separate piles
-- and produced a summary by adding them up at render time. That works until
-- two screens disagree about what a month cost. Here both post into the same
-- general ledger the billing side already writes to, so the trial balance is
-- the single answer and cash position is derived from one place.
--
-- Salary is posted gross, not net. Paying Rs 47,000 against a Rs 50,000 salary
-- is not a Rs 47,000 expense — it is a Rs 50,000 expense of which Rs 3,000 is
-- money withheld and owed to PF/ESI/TDS. Booking the net would understate cost
-- and hide the statutory liability entirely, which is exactly what gets caught
-- at audit.

-- ---------------------------------------------------------------------------
-- Chart of accounts additions
-- ---------------------------------------------------------------------------

insert into public.chart_of_accounts (account_code, account_name, account_type, normal_balance) values
  -- Statutory liabilities: deducted from staff, owed onward.
  ('2310', 'Salary Payable',                 'LIABILITY', 'CR'),
  ('2320', 'PF Payable',                     'LIABILITY', 'CR'),
  ('2330', 'ESI Payable',                    'LIABILITY', 'CR'),
  ('2340', 'TDS Payable (Salary)',           'LIABILITY', 'CR'),
  ('2350', 'Professional Tax Payable',       'LIABILITY', 'CR'),
  -- Operating expenses.
  ('4310', 'Salaries & Wages',               'EXPENSE',   'DR'),
  ('4320', 'Electricity & Utilities',        'EXPENSE',   'DR'),
  ('4330', 'Rent & Lease',                   'EXPENSE',   'DR'),
  ('4340', 'Medical Consumables & Supplies', 'EXPENSE',   'DR'),
  ('4350', 'Equipment & Maintenance',        'EXPENSE',   'DR'),
  ('4360', 'Housekeeping & Security',        'EXPENSE',   'DR'),
  ('4370', 'Marketing & Outreach',           'EXPENSE',   'DR'),
  ('4380', 'Professional & Legal Fees',      'EXPENSE',   'DR'),
  ('4390', 'Miscellaneous Expense',          'EXPENSE',   'DR')
on conflict (account_code) do update
  set account_name   = excluded.account_name,
      account_type   = excluded.account_type,
      normal_balance = excluded.normal_balance;

-- ---------------------------------------------------------------------------
-- record_expense
--   Dr <category expense account> · Cr 1010 Bank/Cash
-- ---------------------------------------------------------------------------

create or replace function public.record_expense(
  p_account_code text,
  p_amount       numeric,
  p_title        text,
  p_vendor       text default null,
  p_mode         text default 'cash',
  p_reference    text default null,
  p_expense_date bigint default null,
  p_note         text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid  text := public.hms_current_facility_id();
  v_role text := public.hms_current_role();
  v_now  bigint := (extract(epoch from now()) * 1000)::bigint;
  v_date bigint;
  v_id   text;
  v_acct public.chart_of_accounts%rowtype;
  v_voucher jsonb;
  v_exp  jsonb;
  v_no   bigint;
  v_year text;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;
  if v_role not in ('billing_staff','facility_admin','super_admin') then
    raise exception 'ROLE_NOT_PERMITTED: % cannot record expenses', coalesce(v_role,'none');
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'INVALID_AMOUNT: expense must be greater than zero';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'TITLE_REQUIRED: an expense needs a description';
  end if;
  if p_mode not in ('cash','upi','card','bank_transfer','cheque') then
    raise exception 'INVALID_MODE: %', coalesce(p_mode,'null');
  end if;

  select * into v_acct from public.chart_of_accounts
   where account_code = p_account_code and is_active;
  if not found then raise exception 'UNKNOWN_ACCOUNT: %', coalesce(p_account_code,'null'); end if;
  -- Guard against an expense being booked to revenue or to an asset by a
  -- mis-set dropdown, which would silently distort the P&L.
  if v_acct.account_type <> 'EXPENSE' then
    raise exception 'NOT_AN_EXPENSE_ACCOUNT: % is %', p_account_code, v_acct.account_type;
  end if;

  v_date := coalesce(p_expense_date, v_now);
  v_year := to_char(to_timestamp(v_date/1000.0) at time zone 'Asia/Kolkata','YYYY');
  v_id   := 'exp'||v_now::text||floor(random()*1000)::text;
  v_no   := public.increment_counter('facilities/'||v_fid||'/counters/expense-'||v_year, 'value');

  v_voucher := public.hms_post_voucher(
    'EXPENSE', v_id,
    btrim(p_title)||coalesce(' — '||nullif(btrim(p_vendor),''), '')||' ('||v_acct.account_name||')',
    jsonb_build_array(
      jsonb_build_object('accountCode', p_account_code, 'dr', p_amount, 'cr', 0),
      jsonb_build_object('accountCode', '1010',         'dr', 0,        'cr', p_amount)
    ),
    null, v_date);

  v_exp := jsonb_build_object(
    'type',          'expense',
    'expenseNumber', 'EXP-'||v_year||'-'||lpad(v_no::text, 5, '0'),
    'accountCode',   p_account_code,
    'accountName',   v_acct.account_name,
    'amount',        p_amount,
    'title',         btrim(p_title),
    'vendor',        nullif(btrim(coalesce(p_vendor,'')), ''),
    'paymentMode',   p_mode,
    'reference',     nullif(btrim(coalesce(p_reference,'')), ''),
    'note',          nullif(btrim(coalesce(p_note,'')), ''),
    'expenseDate',   v_date,
    'voucherNumber', v_voucher->>'voucherNumber',
    'recordedByRole',v_role,
    'createdAt',     v_now,
    'updatedAt',     v_now
  );

  insert into public.documents (path, collection, facility_id, data)
  values ('facilities/'||v_fid||'/accounting/expenses/'||v_id,
          'facilities/'||v_fid||'/accounting/expenses', v_fid, v_exp);

  return v_exp || jsonb_build_object('id', v_id);
end; $function$;

-- ---------------------------------------------------------------------------
-- pay_salary
--   Dr 4310 Salaries & Wages   (gross earnings)
--   Cr 2320 / 2330 / 2340 / 2350  (statutory deductions withheld)
--   Cr 1010 Bank/Cash             (net actually paid)
-- ---------------------------------------------------------------------------

create or replace function public.pay_salary(
  p_staff_id  text,
  p_month     text,               -- 'YYYY-MM'
  p_earnings  jsonb,              -- {"basic":30000,"da":..,"hra":..,"ta":..,"medical":..,"other":..}
  p_deductions jsonb default '{}'::jsonb,  -- {"pf":..,"esi":..,"tds":..,"professionalTax":..,"other":..}
  p_mode      text default 'bank_transfer',
  p_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fid   text := public.hms_current_facility_id();
  v_role  text := public.hms_current_role();
  v_now   bigint := (extract(epoch from now()) * 1000)::bigint;
  v_staff jsonb;
  v_id    text;
  v_gross numeric := 0;
  v_ded   numeric := 0;
  v_net   numeric;
  v_pf    numeric;
  v_esi   numeric;
  v_tds   numeric;
  v_ptax  numeric;
  v_other numeric;
  v_lines jsonb;
  v_voucher jsonb;
  v_pay   jsonb;
  v_key   text;
begin
  if v_fid is null then raise exception 'NOT_A_FACILITY_MEMBER'; end if;
  -- Payroll is not a billing-desk job: it exposes every colleague's salary.
  if v_role not in ('facility_admin','super_admin') then
    raise exception 'ROLE_NOT_PERMITTED: % cannot run payroll', coalesce(v_role,'none');
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'INVALID_MONTH: expected YYYY-MM, got %', coalesce(p_month,'null');
  end if;

  select d.data into v_staff from public.documents d
   where d.path = 'facilities/'||v_fid||'/staff/'||p_staff_id;
  if v_staff is null then raise exception 'STAFF_NOT_FOUND: %', p_staff_id; end if;

  -- One payment per person per month. The guard is the document path itself,
  -- so a double-click cannot pay twice even under concurrency.
  v_key := p_staff_id||'-'||p_month;
  if exists (select 1 from public.documents
              where path = 'facilities/'||v_fid||'/accounting/payroll/'||v_key) then
    raise exception 'ALREADY_PAID: % has already been paid for %', v_staff->>'name', p_month;
  end if;

  select coalesce(sum((value)::numeric), 0) into v_gross
    from jsonb_each_text(coalesce(p_earnings, '{}'::jsonb));

  v_pf    := coalesce((p_deductions->>'pf')::numeric, 0);
  v_esi   := coalesce((p_deductions->>'esi')::numeric, 0);
  v_tds   := coalesce((p_deductions->>'tds')::numeric, 0);
  v_ptax  := coalesce((p_deductions->>'professionalTax')::numeric, 0);
  v_other := coalesce((p_deductions->>'other')::numeric, 0);
  v_ded   := v_pf + v_esi + v_tds + v_ptax + v_other;

  if v_gross <= 0 then raise exception 'INVALID_EARNINGS: gross must be greater than zero'; end if;
  if v_ded < 0 then raise exception 'INVALID_DEDUCTIONS: deductions cannot be negative'; end if;
  if v_ded > v_gross then
    raise exception 'DEDUCTIONS_EXCEED_EARNINGS: % > %', v_ded, v_gross;
  end if;
  v_net := v_gross - v_ded;

  -- Gross expense first, then every place the money actually went.
  v_lines := jsonb_build_array(
    jsonb_build_object('accountCode','4310','dr',v_gross,'cr',0));
  if v_pf > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('accountCode','2320','dr',0,'cr',v_pf));
  end if;
  if v_esi > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('accountCode','2330','dr',0,'cr',v_esi));
  end if;
  if v_tds > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('accountCode','2340','dr',0,'cr',v_tds));
  end if;
  if v_ptax > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('accountCode','2350','dr',0,'cr',v_ptax));
  end if;
  -- "Other" deductions (advances, loan recovery) reduce what is still owed
  -- to the employee rather than creating a statutory liability.
  if v_other > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('accountCode','2310','dr',0,'cr',v_other));
  end if;
  if v_net > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('accountCode','1010','dr',0,'cr',v_net));
  end if;

  v_id := v_key;
  v_voucher := public.hms_post_voucher(
    'SALARY', v_id,
    'Salary '||p_month||' — '||coalesce(v_staff->>'name','staff')
      ||' (gross '||v_gross::text||', net '||v_net::text||')',
    v_lines);

  v_pay := jsonb_build_object(
    'type',          'payroll',
    'staffId',       p_staff_id,
    'staffName',     v_staff->>'name',
    'staffRole',     v_staff->>'role',
    'month',         p_month,
    'earnings',      coalesce(p_earnings, '{}'::jsonb),
    'deductions',    coalesce(p_deductions, '{}'::jsonb),
    'grossEarnings', v_gross,
    'totalDeductions', v_ded,
    'netSalary',     v_net,
    'paymentMode',   p_mode,
    'reference',     nullif(btrim(coalesce(p_reference,'')), ''),
    'voucherNumber', v_voucher->>'voucherNumber',
    'paidByRole',    v_role,
    'paidAt',        v_now,
    'createdAt',     v_now,
    'updatedAt',     v_now
  );

  insert into public.documents (path, collection, facility_id, data)
  values ('facilities/'||v_fid||'/accounting/payroll/'||v_id,
          'facilities/'||v_fid||'/accounting/payroll', v_fid, v_pay);

  return v_pay || jsonb_build_object('id', v_id);
end; $function$;

-- ---------------------------------------------------------------------------
-- Cash position, derived from the ledger rather than recomputed per screen.
-- ---------------------------------------------------------------------------

create or replace view public.v_cash_position
with (security_invoker = true) as
select facility_id,
       sum(debit)  filter (where account_code = '1010') as cash_in,
       sum(credit) filter (where account_code = '1010') as cash_out,
       coalesce(sum(debit) filter (where account_code = '1010'), 0)
         - coalesce(sum(credit) filter (where account_code = '1010'), 0) as cash_balance
  from public.v_ledger_lines
 group by facility_id;

revoke all on public.v_cash_position from anon;
grant select on public.v_cash_position to authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('record_expense','pay_salary')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke execute on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
