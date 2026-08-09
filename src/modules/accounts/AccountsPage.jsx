import { useState, useEffect, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { subscribeToCollection } from '@lib/db'
import { formatINR, formatDate, toISODate } from '@lib/utils'
import {
  getTrialBalance, getLedgerLines, getUnbalancedVouchers,
  trialBalanceTotals, groupByAccountType, canRunPayroll, canPostAccounting,
  currentMonth, monthLabel, expenseAccount,
} from '@lib/accounting'
import StatCard from '@components/StatCard'
import ExpensesTab from './ExpensesTab'
import PayrollTab from './PayrollTab'
import SettlementsTab from './SettlementsTab'
import {
  BookOpen, IndianRupee, Receipt, Wallet, TrendingUp, TrendingDown,
  Download, AlertTriangle, CheckCircle, Layers, ShieldCheck,
} from 'lucide-react'

function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Accounts & Payroll — the money-out side of the hospital, plus the books.
//
// Everything here reads from the same general ledger the billing side writes
// to. There is no second set of totals kept in parallel: income, expenses and
// payroll all resolve to vouchers, so the trial balance is the one answer and
// "what did this month cost" cannot differ between two screens.
export default function AccountsPage() {
  const { facilityId } = useFacility()
  const { staffProfile } = useAuth()
  const role = staffProfile?.role
  const mayRunPayroll = canRunPayroll(role)
  const maySettle = canPostAccounting(role)

  const TABS = [
    { key: 'overview', label: 'Overview', icon: Layers },
    { key: 'expenses', label: 'Expenses', icon: Receipt },
    mayRunPayroll && { key: 'payroll', label: 'Payroll', icon: Wallet },
    maySettle && { key: 'settlements', label: 'Settlements', icon: ShieldCheck },
    { key: 'ledger', label: 'Ledger & Trial Balance', icon: BookOpen },
  ].filter(Boolean)

  const [tab, setTab] = useState('overview')
  const [month, setMonth] = useState(currentMonth())

  const [expenses, setExpenses] = useState([])
  const [payroll, setPayroll] = useState([])
  const [staff, setStaff] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/accounting/expenses`, (d) => {
        setExpenses(d); setLoading(false)
      }),
      subscribeToCollection(`facilities/${facilityId}/accounting/payroll`, setPayroll),
      subscribeToCollection(`facilities/${facilityId}/staff`, setStaff),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  // Invoices are only needed by Settlements, and billing is the collection most
  // likely to be large. Subscribing on tab entry keeps the rest of the module
  // from paying for it.
  useEffect(() => {
    if (!facilityId || tab !== 'settlements') return
    return subscribeToCollection(`facilities/${facilityId}/billing`, (d) =>
      setInvoices(d.filter((r) => r.type === 'invoice')))
  }, [facilityId, tab])

  if (loading) return <div className="empty-state">Loading accounts…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><BookOpen size={22} /> Accounts &amp; Payroll</h2>
          <p>{monthLabel(month)}</p>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab expenses={expenses} payroll={payroll} month={month} />
      )}
      {tab === 'expenses' && <ExpensesTab expenses={expenses} month={month} />}
      {tab === 'payroll' && mayRunPayroll && (
        <PayrollTab payroll={payroll} staff={staff} month={month} setMonth={setMonth} />
      )}
      {tab === 'settlements' && maySettle && (
        <SettlementsTab invoices={invoices} staff={staff} />
      )}
      {tab === 'ledger' && <LedgerTab month={month} />}
    </div>
  )
}

// Month at a glance: what came in, what went out, what is left.
function OverviewTab({ expenses, payroll, month }) {
  const [balance, setBalance] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getTrialBalance()
      .then((tb) => { if (live) { setBalance(tb); setError('') } })
      .catch((err) => {
        if (!live) return
        console.error('Trial balance error:', err)
        setError('Could not load the ledger.')
      })
    return () => { live = false }
  }, [month])

  const inMonth = (ts) => toISODate(new Date(ts)).startsWith(month)
  const monthExpense = expenses.filter((e) => inMonth(e.expenseDate || e.createdAt))
    .reduce((s, e) => s + Number(e.amount || 0), 0)
  const monthPayroll = payroll.filter((p) => p.month === month)
    .reduce((s, p) => s + Number(p.grossEarnings || 0), 0)

  // Income and cash come from the ledger, not from re-summing invoices, so
  // they agree with the trial balance by construction.
  const revenue = balance.filter((r) => r.account_type === 'REVENUE')
    .reduce((s, r) => s + Number(r.balance || 0), 0)
  const expenseTotal = balance.filter((r) => r.account_type === 'EXPENSE')
    .reduce((s, r) => s + Number(r.balance || 0), 0)
  const cash = balance.filter((r) => r.account_code === '1010')
    .reduce((s, r) => s + Number(r.balance || 0), 0)
  const liabilities = balance.filter((r) => r.account_type === 'LIABILITY')
    .reduce((s, r) => s + Number(r.balance || 0), 0)
  const net = revenue - expenseTotal

  if (error) return <div className="auth-error">{error}</div>

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={TrendingUp} label="Total Income" value={formatINR(revenue)}
          sub="all revenue heads" color="green" />
        <StatCard icon={TrendingDown} label="Total Expense" value={formatINR(expenseTotal)}
          sub="all expense heads" color="red" />
        <StatCard icon={IndianRupee} label={net >= 0 ? 'Surplus' : 'Deficit'}
          value={formatINR(Math.abs(net))} sub="income minus expense"
          color={net >= 0 ? 'teal' : 'red'} />
        <StatCard icon={Wallet} label="Cash / Bank" value={formatINR(cash)}
          sub="balance on hand" color="blue" />
      </div>

      <div className="stats-grid">
        <StatCard icon={Receipt} label="Expenses This Month" value={formatINR(monthExpense)}
          sub={monthLabel(month)} color="amber" />
        <StatCard icon={Wallet} label="Payroll This Month" value={formatINR(monthPayroll)}
          sub="gross cost" color="purple" />
        <StatCard icon={AlertTriangle} label="Payable / Held" value={formatINR(liabilities)}
          sub="deposits, PF, ESI, TDS, doctor share" color="amber" />
      </div>

      <div className="settings-section">
        <h3>What is owed onward</h3>
        <p className="settings-hint">
          Money the hospital is holding but does not own — patient advances not
          yet adjusted, and statutory deductions withheld from salaries.
        </p>
        {balance.filter((r) => r.account_type === 'LIABILITY' && Number(r.balance) !== 0).length === 0 ? (
          <p className="text-muted">Nothing outstanding.</p>
        ) : (
          <div className="data-table-scroll">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Account</th><th>Balance</th></tr></thead>
              <tbody>
                {balance
                  .filter((r) => r.account_type === 'LIABILITY' && Number(r.balance) !== 0)
                  .map((r) => (
                    <tr key={r.account_code}>
                      <td className="font-mono">{r.account_code}</td>
                      <td>{r.account_name}</td>
                      <td>{formatINR(r.balance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Trial balance + day book. Reads run server-side: the ledger only grows, and
// it is the one dataset here guaranteed to outgrow the browser on a real
// tenant.
//
// The tie-out banner is the point. A trial balance that does not tie means a
// voucher got in that should have been impossible, so it is stated up front
// rather than left for someone to add up by eye.
function LedgerTab({ month }) {
  const [balance, setBalance] = useState([])
  const [journal, setJournal] = useState([])
  const [unbalanced, setUnbalanced] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const range = useMemo(() => {
    const from = new Date(`${month}-01T00:00:00`).getTime()
    const d = new Date(`${month}-01T00:00:00`)
    d.setMonth(d.getMonth() + 1)
    return { from, to: d.getTime() - 1 }
  }, [month])

  useEffect(() => {
    let live = true
    setLoading(true)
    Promise.all([
      getTrialBalance(),
      getLedgerLines({ from: range.from, to: range.to }),
      getUnbalancedVouchers(),
    ])
      .then(([tb, jl, ub]) => {
        if (!live) return
        setBalance(tb); setJournal(jl); setUnbalanced(ub); setError('')
      })
      .catch((err) => {
        if (!live) return
        console.error('Ledger error:', err)
        setError('Could not load the ledger. Please try again.')
      })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [range.from, range.to])

  const totals = useMemo(() => trialBalanceTotals(balance), [balance])
  const groups = useMemo(() => groupByAccountType(balance), [balance])

  if (loading) return <div className="empty-state">Loading ledger…</div>
  if (error) return <div className="auth-error">{error}</div>
  if (balance.length === 0) {
    return (
      <div className="empty-state">
        <p>No journal entries yet. Vouchers post automatically when an invoice is
          settled, and when a deposit, expense or salary is recorded.</p>
      </div>
    )
  }

  const tied = totals.balanced && unbalanced.length === 0

  return (
    <div>
      <div className={`ledger-tieout ${tied ? 'ok' : 'bad'}`}>
        {tied ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
        <span>
          {tied
            ? `Books tie out — total debits ${formatINR(totals.totalDebit)} = total credits ${formatINR(totals.totalCredit)}.`
            : `Trial balance is OUT by ${formatINR(Math.abs(totals.difference))}`
              + (unbalanced.length ? ` across ${unbalanced.length} voucher(s): `
                  + unbalanced.map((u) => u.voucher_number).join(', ') : '')
              + '. Do not close the books — raise this with your administrator.'}
        </span>
      </div>

      <div className="stats-grid">
        <StatCard icon={IndianRupee} label="Total Debits" value={formatINR(totals.totalDebit)} color="teal" />
        <StatCard icon={IndianRupee} label="Total Credits" value={formatINR(totals.totalCredit)} color="blue" />
        <StatCard icon={BookOpen} label="Journal Lines" value={journal.length}
          sub={monthLabel(month)} color="purple" />
      </div>

      {groups.map((g) => (
        <LedgerTable
          key={g.type}
          title={`Trial Balance — ${g.type.charAt(0) + g.type.slice(1).toLowerCase()}`}
          headers={['Code', 'Account', 'Debit', 'Credit', 'Balance']}
          rows={g.rows.map((r) => [
            r.account_code, r.account_name,
            formatINR(r.total_debit), formatINR(r.total_credit), formatINR(r.balance),
          ])}
          filename={`trial-balance-${g.type.toLowerCase()}.csv`}
        />
      ))}

      <LedgerTable
        title={`Journal (Day Book) — ${monthLabel(month)}`}
        headers={['Voucher', 'Date', 'Source', 'Account', 'Debit', 'Credit', 'Narration']}
        rows={journal.map((l) => [
          l.voucher_number, formatDate(l.voucher_date, 'date'), l.source_type,
          l.account_code, l.debit ? formatINR(l.debit) : '—',
          l.credit ? formatINR(l.credit) : '—', l.narration,
        ])}
        filename={`journal-${month}.csv`}
      />
    </div>
  )
}

function LedgerTable({ title, headers, rows, filename }) {
  return (
    <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
      <div className="section-head-row">
        <h3>{title}</h3>
        <button className="btn btn-outline btn-sm"
          onClick={() => downloadCSV(filename, headers, rows)} disabled={rows.length === 0}>
          <Download size={13} /> Export CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">Nothing in this period.</p>
      ) : (
        <div className="data-table-scroll">
          <table className="data-table">
            <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
