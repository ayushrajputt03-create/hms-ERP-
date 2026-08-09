// Double-entry accounting — client side of the Phase 9 ledger.
//
// Nothing here writes a journal entry directly. Vouchers are posted by the
// database: a trigger books revenue the moment an invoice reaches 'paid', and
// the RPCs below cover the entries that need a human decision (a deposit taken
// at the counter, a TPA settlement, a doctor's share). The posting primitive
// itself is not exposed to the browser at all — arbitrary journal entries
// would bypass every rule the RPCs enforce.

import { supabase } from './supabase'

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE']

export const DEPOSIT_MODES = ['cash', 'upi', 'card', 'bank_transfer']
export const DEPOSIT_MODE_LABELS = {
  cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank Transfer',
}

// Only these roles may touch money-in entries; mirrors the server-side check
// so the UI can hide what the RPC would refuse anyway.
export const ACCOUNTING_ROLES = ['billing_staff', 'facility_admin', 'super_admin']
export const canPostAccounting = (role) => ACCOUNTING_ROLES.includes(role)

function requireClient() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

// ---- Entries requiring a human decision -------------------------------------

// Dr 1010 Bank/Cash · Cr 2110 Advance Deposit Liability.
// Deliberately never touches a revenue account: money taken before treatment
// is owed back until a bill consumes it.
export async function recordAdvanceDeposit({ patientId, amount, mode, admissionId }) {
  const { data, error } = await requireClient().rpc('record_advance_deposit', {
    p_patient_id: patientId,
    p_amount: amount,
    p_mode: mode,
    p_admission_id: admissionId || null,
  })
  if (error) throw error
  return data
}

// Dr 1010 net + Dr 1310 TDS + Dr 4210 disallowed · Cr 1210 receivable.
// The server refuses the posting unless the three buckets add up to the claim,
// so a short settlement cannot quietly clear the receivable.
export async function settleTpaClaim({ invoiceId, netReceived, tdsAmount = 0, disallowedAmount = 0 }) {
  const { data, error } = await requireClient().rpc('settle_tpa_claim_gl', {
    p_invoice_id: invoiceId,
    p_net_received: netReceived,
    p_tds_amount: tdsAmount,
    p_disallowed_amount: disallowedAmount,
  })
  if (error) throw error
  return data
}

// Dr 4010 Doctor Share Expense · Cr 2210 Payout Payable, at the doctor's
// configured revenueSharePercent. Returns { posted: false } for salaried
// doctors rather than raising — no share configured is not an error.
export async function accrueDoctorShare({ invoiceId, doctorId }) {
  const { data, error } = await requireClient().rpc('accrue_doctor_revenue_share_gl', {
    p_invoice_id: invoiceId,
    p_doctor_id: doctorId,
  })
  if (error) throw error
  return data
}

// ---- Reporting reads --------------------------------------------------------
// These are security_invoker views, so RLS on `documents` scopes every row to
// the caller's own facility. No facility filter is passed from the client on
// purpose — one that could be passed could also be forged.

export async function getChartOfAccounts() {
  const { data, error } = await requireClient()
    .from('chart_of_accounts').select('*').eq('is_active', true).order('account_code')
  if (error) throw error
  return data || []
}

export async function getTrialBalance() {
  const { data, error } = await requireClient()
    .from('v_trial_balance').select('*').order('account_code')
  if (error) throw error
  return data || []
}

export async function getLedgerLines({ from, to, limit = 500 } = {}) {
  let q = requireClient().from('v_ledger_lines').select('*')
  if (from) q = q.gte('voucher_date', from)
  if (to) q = q.lte('voucher_date', to)
  const { data, error } = await q.order('voucher_date', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

export async function getPatientLedger(patientId, { limit = 200 } = {}) {
  const { data, error } = await requireClient()
    .from('v_ledger_by_patient').select('*')
    .eq('patient_id', patientId)
    .order('voucher_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Which source records already have a voucher of a given kind. Posting is
// idempotent server-side, so this is not a safety check — it is so the UI can
// say "already settled" instead of offering a button that quietly does nothing.
export async function getPostedSources(sourceType) {
  const { data, error } = await requireClient()
    .from('v_ledger_lines').select('source_id').eq('source_type', sourceType)
  if (error) throw error
  return new Set((data || []).map((r) => r.source_id))
}

// Must always come back empty. A non-empty result means an unbalanced voucher
// reached the ledger, which the posting function is supposed to make
// impossible — surfaced in the UI rather than left for an audit to find.
export async function getUnbalancedVouchers() {
  const { data, error } = await requireClient()
    .from('v_voucher_balance_check').select('*')
  if (error) throw error
  return data || []
}

// ---- Derived helpers --------------------------------------------------------

// A trial balance is only meaningful if it ties. Returned alongside the rows
// so the Accounts tab can show the check rather than imply it.
export function trialBalanceTotals(rows = []) {
  const totalDebit = rows.reduce((s, r) => s + Number(r.total_debit || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + Number(r.total_credit || 0), 0)
  return {
    totalDebit,
    totalCredit,
    // Compared at paise, not exactly: these are numerics off a JSONB split.
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    difference: totalDebit - totalCredit,
  }
}

export function groupByAccountType(rows = []) {
  return ACCOUNT_TYPES.map((type) => ({
    type,
    rows: rows.filter((r) => r.account_type === type),
    total: rows
      .filter((r) => r.account_type === type)
      .reduce((s, r) => s + Number(r.balance || 0), 0),
  })).filter((g) => g.rows.length > 0)
}

// ---- Expenses ---------------------------------------------------------------

// Expense heads, in the order they matter to a hospital's month. These mirror
// the EXPENSE rows in chart_of_accounts; the server re-checks the code and
// refuses anything that is not an expense account, so a stale entry here can
// never post to revenue by mistake.
export const EXPENSE_ACCOUNTS = [
  { code: '4310', label: 'Salaries & Wages',               icon: '💼' },
  { code: '4320', label: 'Electricity & Utilities',        icon: '⚡' },
  { code: '4330', label: 'Rent & Lease',                   icon: '🏢' },
  { code: '4340', label: 'Medical Consumables & Supplies', icon: '🩺' },
  { code: '4350', label: 'Equipment & Maintenance',        icon: '🔧' },
  { code: '4360', label: 'Housekeeping & Security',        icon: '🧹' },
  { code: '4370', label: 'Marketing & Outreach',           icon: '📢' },
  { code: '4380', label: 'Professional & Legal Fees',      icon: '⚖️' },
  { code: '4390', label: 'Miscellaneous Expense',          icon: '📦' },
]

export const EXPENSE_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'cheque']
export const EXPENSE_MODE_LABELS = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  bank_transfer: 'Bank Transfer', cheque: 'Cheque',
}

export const expenseAccount = (code) =>
  EXPENSE_ACCOUNTS.find((a) => a.code === code) || { code, label: code, icon: '📦' }

export async function recordExpense({
  accountCode, amount, title, vendor, mode = 'cash', reference, expenseDate, note,
}) {
  const { data, error } = await requireClient().rpc('record_expense', {
    p_account_code: accountCode,
    p_amount: amount,
    p_title: title,
    p_vendor: vendor || null,
    p_mode: mode,
    p_reference: reference || null,
    p_expense_date: expenseDate || null,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

// ---- Payroll ----------------------------------------------------------------

// Payslip arithmetic, kept here so the form, the payslip PDF and the register
// all read the same numbers. Percentages are of basic, which is how Indian
// payroll is written; flat components are taken as entered.
export function computePayslip(input = {}) {
  const n = (v) => Number(v) || 0
  const basic = n(input.basic)
  const da = Math.round(basic * n(input.daPercent) / 100)
  const hra = Math.round(basic * n(input.hraPercent) / 100)
  const ta = n(input.ta)
  const medical = n(input.medical)
  const otherEarnings = n(input.otherEarnings)

  const pf = Math.round(basic * n(input.pfPercent) / 100)
  const esi = Math.round(basic * n(input.esiPercent) / 100)
  const tds = n(input.tds)
  const professionalTax = n(input.professionalTax)
  const otherDeductions = n(input.otherDeductions)

  const earnings = { basic, da, hra, ta, medical, other: otherEarnings }
  const deductions = { pf, esi, tds, professionalTax, other: otherDeductions }
  const grossEarnings = basic + da + hra + ta + medical + otherEarnings
  const totalDeductions = pf + esi + tds + professionalTax + otherDeductions

  return {
    earnings, deductions, grossEarnings, totalDeductions,
    netSalary: Math.max(0, grossEarnings - totalDeductions),
    // Surfaced so the form can block before the server has to.
    overDeducted: totalDeductions > grossEarnings,
  }
}

export async function paySalary({ staffId, month, earnings, deductions, mode, reference }) {
  const { data, error } = await requireClient().rpc('pay_salary', {
    p_staff_id: staffId,
    p_month: month,
    p_earnings: earnings,
    p_deductions: deductions || {},
    p_mode: mode || 'bank_transfer',
    p_reference: reference || null,
  })
  if (error) throw error
  return data
}

// Dashboard tiles, aggregated server-side.
//
// Counting these in the browser would mean downloading four whole collections
// to render six numbers. The facility is taken from the caller's session
// inside the function, never passed in.
export async function getDashboardStats() {
  const { data, error } = await requireClient().rpc('hms_dashboard_stats')
  if (error) throw error
  return data || null
}

export async function getCashPosition() {
  const { data, error } = await requireClient()
    .from('v_cash_position').select('*').maybeSingle()
  if (error) throw error
  return data || { cash_in: 0, cash_out: 0, cash_balance: 0 }
}

// Only facility_admin/super_admin may run payroll — it exposes every
// colleague's salary. Mirrors the server-side check in pay_salary.
export const PAYROLL_ROLES = ['facility_admin', 'super_admin']
export const canRunPayroll = (role) => PAYROLL_ROLES.includes(role)

export const currentMonth = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 7)
}

export const monthLabel = (m) => {
  if (!m) return ''
  const d = new Date(`${m}-01T00:00:00`)
  return Number.isNaN(d.getTime()) ? m
    : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
