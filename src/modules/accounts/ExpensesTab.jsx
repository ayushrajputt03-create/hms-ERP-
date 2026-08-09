import { useState, useMemo } from 'react'
import {
  recordExpense, expenseAccount, EXPENSE_ACCOUNTS,
  EXPENSE_MODES, EXPENSE_MODE_LABELS,
} from '@lib/accounting'
import { formatINR, formatDate, toISODate } from '@lib/utils'
import { Plus, Loader, Receipt, Search } from 'lucide-react'
import StatCard from '@components/StatCard'

// Every expense posts a balanced voucher (Dr expense head, Cr cash) in the same
// transaction, so the month's spend on this screen and the trial balance can
// never disagree. There is no separate expense total to reconcile.
export default function ExpensesTab({ expenses, month }) {
  const [form, setForm] = useState({
    accountCode: '4340', amount: '', title: '', vendor: '',
    mode: 'cash', reference: '', date: toISODate(new Date()), note: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [filter, setFilter] = useState('')
  const [head, setHead] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const monthRows = useMemo(
    () => expenses.filter((e) => toISODate(new Date(e.expenseDate || e.createdAt)).startsWith(month)),
    [expenses, month]
  )

  const byHead = useMemo(() => {
    const map = {}
    monthRows.forEach((e) => {
      map[e.accountCode] = (map[e.accountCode] || 0) + Number(e.amount || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [monthRows])

  const monthTotal = monthRows.reduce((s, e) => s + Number(e.amount || 0), 0)

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return expenses
      .filter((e) => !head || e.accountCode === head)
      .filter((e) => !q
        || (e.title || '').toLowerCase().includes(q)
        || (e.vendor || '').toLowerCase().includes(q)
        || (e.expenseNumber || '').toLowerCase().includes(q))
      .sort((a, b) => (b.expenseDate || 0) - (a.expenseDate || 0))
  }, [expenses, filter, head])

  const submit = async (e) => {
    e.preventDefault()
    const amt = Number(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) { setError('Enter an amount greater than zero.'); return }
    if (!form.title.trim()) { setError('Give the expense a short description.'); return }
    setSaving(true); setError(''); setOk('')
    try {
      const saved = await recordExpense({
        accountCode: form.accountCode,
        amount: amt,
        title: form.title,
        vendor: form.vendor,
        mode: form.mode,
        reference: form.reference,
        note: form.note,
        expenseDate: form.date ? new Date(`${form.date}T00:00:00`).getTime() : null,
      })
      setOk(`${saved.expenseNumber} recorded — voucher ${saved.voucherNumber}`)
      setForm((f) => ({ ...f, amount: '', title: '', vendor: '', reference: '', note: '' }))
    } catch (err) {
      console.error('Expense error:', err)
      setError(err?.message || 'Could not record the expense.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={Receipt} label="Spent This Month" value={formatINR(monthTotal)}
          sub={`${monthRows.length} entr${monthRows.length === 1 ? 'y' : 'ies'}`} color="red" />
        <StatCard icon={Receipt} label="Biggest Head"
          value={byHead[0] ? expenseAccount(byHead[0][0]).label : '—'}
          sub={byHead[0] ? formatINR(byHead[0][1]) : 'nothing yet'} color="amber" />
        <StatCard icon={Receipt} label="All-Time Entries" value={expenses.length} color="blue" />
      </div>

      <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
        <h3><Plus size={17} /> Add Expense</h3>
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Expense Head *</label>
              <select value={form.accountCode} onChange={set('accountCode')}>
                {EXPENSE_ACCOUNTS.map((a) => (
                  <option key={a.code} value={a.code}>{a.icon} {a.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Amount *</label>
              <input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="e.g. 15000" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" value={form.date} onChange={set('date')} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Description *</label>
              <input value={form.title} onChange={set('title')} placeholder="e.g. August electricity bill" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Vendor / Paid To</label>
              <input value={form.vendor} onChange={set('vendor')} placeholder="e.g. UPPCL" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Payment Mode</label>
              <select value={form.mode} onChange={set('mode')}>
                {EXPENSE_MODES.map((m) => (
                  <option key={m} value={m}>{EXPENSE_MODE_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Reference / Bill No.</label>
              <input value={form.reference} onChange={set('reference')} placeholder="optional" />
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <Loader size={14} className="spin" /> : <Plus size={14} />} Record Expense
              </button>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {ok && <div className="ledger-tieout ok" style={{ marginTop: '0.75rem' }}>{ok}</div>}
        </form>
      </div>

      {byHead.length > 0 && (
        <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
          <h3>This Month by Head</h3>
          <div className="expense-head-grid">
            {byHead.map(([code, amt]) => {
              const a = expenseAccount(code)
              const pct = monthTotal ? Math.round((amt / monthTotal) * 100) : 0
              return (
                <button key={code}
                  className={`expense-head-card ${head === code ? 'active' : ''}`}
                  onClick={() => setHead(head === code ? '' : code)}>
                  <span className="expense-head-name">{a.icon} {a.label}</span>
                  <strong>{formatINR(amt)}</strong>
                  <span className="expense-head-bar"><i style={{ width: `${pct}%` }} /></span>
                  <span className="text-muted">{pct}% of month</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="settings-section">
        <div className="section-head-row">
          <h3>Expense List</h3>
          <div className="patient-search-input" style={{ maxWidth: 320, margin: 0 }}>
            <Search size={15} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="Search description, vendor or number..." />
          </div>
        </div>
        {head && (
          <p className="text-muted">
            Filtered to {expenseAccount(head).label}.{' '}
            <button className="btn-link" onClick={() => setHead('')}>Clear</button>
          </p>
        )}
        {visible.length === 0 ? (
          <p className="text-muted">No expenses recorded yet.</p>
        ) : (
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No.</th><th>Date</th><th>Head</th><th>Description</th>
                  <th>Vendor</th><th>Mode</th><th>Amount</th><th>Voucher</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono">{e.expenseNumber}</td>
                    <td>{formatDate(e.expenseDate, 'date')}</td>
                    <td>{expenseAccount(e.accountCode).icon} {e.accountName}</td>
                    <td>{e.title}</td>
                    <td>{e.vendor || '—'}</td>
                    <td>{EXPENSE_MODE_LABELS[e.paymentMode] || e.paymentMode}</td>
                    <td>{formatINR(e.amount)}</td>
                    <td className="font-mono">{e.voucherNumber}</td>
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
