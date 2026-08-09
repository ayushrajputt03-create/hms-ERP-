import { useState, useMemo } from 'react'
import { paySalary, computePayslip, monthLabel } from '@lib/accounting'
import { formatINR, formatDate } from '@lib/utils'
import { ROLE_LABELS } from '@lib/constants'
import { Wallet, Loader, Users, AlertTriangle } from 'lucide-react'
import StatCard from '@components/StatCard'

const FIELDS_EARNINGS = [
  ['basic', 'Basic *', 'e.g. 30000'],
  ['daPercent', 'DA %', 'e.g. 20'],
  ['hraPercent', 'HRA %', 'e.g. 30'],
  ['ta', 'Transport Allowance', 'e.g. 2000'],
  ['medical', 'Medical Allowance', 'e.g. 1000'],
  ['otherEarnings', 'Other Earnings', '0'],
]

const FIELDS_DEDUCTIONS = [
  ['pfPercent', 'PF %', 'e.g. 12'],
  ['esiPercent', 'ESI %', 'e.g. 0.75'],
  ['tds', 'TDS', '0'],
  ['professionalTax', 'Professional Tax', 'e.g. 200'],
  ['otherDeductions', 'Other (advance, loan)', '0'],
]

// Payroll posts salary GROSS, not net. Paying Rs 43,325 against a Rs 50,000
// salary is a Rs 50,000 expense of which Rs 6,675 is withheld and owed to
// PF/ESI/TDS — booking only the net would understate cost and hide the
// statutory liability entirely.
export default function PayrollTab({ payroll, staff, month, setMonth }) {
  const [staffId, setStaffId] = useState('')
  const [input, setInput] = useState({
    basic: '', daPercent: '', hraPercent: '', ta: '', medical: '', otherEarnings: '',
    pfPercent: '', esiPercent: '', tds: '', professionalTax: '', otherDeductions: '',
  })
  const [mode, setMode] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const set = (k) => (e) => setInput((f) => ({ ...f, [k]: e.target.value }))
  const slip = useMemo(() => computePayslip(input), [input])

  const monthRows = useMemo(
    () => payroll.filter((p) => p.month === month),
    [payroll, month]
  )
  const paidIds = useMemo(() => new Set(monthRows.map((p) => p.staffId)), [monthRows])
  const pending = staff.filter((s) => !paidIds.has(s.id))
  const monthCost = monthRows.reduce((s, p) => s + Number(p.grossEarnings || 0), 0)
  const monthNet = monthRows.reduce((s, p) => s + Number(p.netSalary || 0), 0)

  const alreadyPaid = staffId && paidIds.has(staffId)

  const submit = async (e) => {
    e.preventDefault()
    if (!staffId) { setError('Select a staff member.'); return }
    if (alreadyPaid) { setError('This person has already been paid for this month.'); return }
    if (slip.grossEarnings <= 0) { setError('Enter at least a basic salary.'); return }
    if (slip.overDeducted) { setError('Deductions cannot exceed gross earnings.'); return }
    setSaving(true); setError(''); setOk('')
    try {
      const saved = await paySalary({
        staffId, month,
        earnings: slip.earnings,
        deductions: slip.deductions,
        mode, reference,
      })
      setOk(`${saved.staffName} paid ${formatINR(saved.netSalary)} — voucher ${saved.voucherNumber}`)
      setStaffId(''); setReference('')
    } catch (err) {
      console.error('Payroll error:', err)
      setError(err?.message || 'Could not run this payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={Wallet} label="Payroll Cost" value={formatINR(monthCost)}
          sub={`gross for ${monthLabel(month)}`} color="red" />
        <StatCard icon={Wallet} label="Paid Out" value={formatINR(monthNet)}
          sub="net, after deductions" color="teal" />
        <StatCard icon={Users} label="Pending" value={pending.length}
          sub={`of ${staff.length} staff`} color="amber" />
      </div>

      <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
        <div className="section-head-row">
          <h3><Wallet size={17} /> Pay Salary</h3>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Staff Member *</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select staff...</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id} disabled={paidIds.has(s.id)}>
                  {s.name} — {ROLE_LABELS[s.role] || s.role}
                  {paidIds.has(s.id) ? ' (already paid)' : ''}
                </option>
              ))}
            </select>
          </div>

          {alreadyPaid && (
            <div className="ledger-tieout bad">
              <AlertTriangle size={15} />
              <span>Already paid for {monthLabel(month)}. Pick another month or another person.</span>
            </div>
          )}

          <h4 className="payroll-group-title">Earnings</h4>
          <div className="payroll-grid">
            {FIELDS_EARNINGS.map(([k, label, ph]) => (
              <div className="form-group" key={k}>
                <label>{label}</label>
                <input value={input[k]} onChange={set(k)} inputMode="decimal" placeholder={ph} />
              </div>
            ))}
          </div>

          <h4 className="payroll-group-title">Deductions</h4>
          <div className="payroll-grid">
            {FIELDS_DEDUCTIONS.map(([k, label, ph]) => (
              <div className="form-group" key={k}>
                <label>{label}</label>
                <input value={input[k]} onChange={set(k)} inputMode="decimal" placeholder={ph} />
              </div>
            ))}
          </div>

          {/* DA/HRA/PF/ESI are percentages of basic, so the rupee value only
              becomes visible once basic is entered. Showing the computed
              amounts avoids the classic "I typed 12 and it paid 12 rupees". */}
          <div className="payslip-summary">
            <div><span>Basic</span><strong>{formatINR(slip.earnings.basic)}</strong></div>
            <div><span>DA</span><strong>{formatINR(slip.earnings.da)}</strong></div>
            <div><span>HRA</span><strong>{formatINR(slip.earnings.hra)}</strong></div>
            <div><span>Gross</span><strong>{formatINR(slip.grossEarnings)}</strong></div>
            <div><span>PF</span><strong>{formatINR(slip.deductions.pf)}</strong></div>
            <div><span>ESI</span><strong>{formatINR(slip.deductions.esi)}</strong></div>
            <div><span>Deductions</span><strong>{formatINR(slip.totalDeductions)}</strong></div>
            <div className="payslip-net"><span>Net Payable</span><strong>{formatINR(slip.netSalary)}</strong></div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Payment Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Reference</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." />
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-primary" type="submit"
                disabled={saving || slip.overDeducted || alreadyPaid}>
                {saving ? <Loader size={14} className="spin" /> : <Wallet size={14} />} Pay Salary
              </button>
            </div>
          </div>

          {slip.overDeducted && (
            <div className="auth-error">Deductions ({formatINR(slip.totalDeductions)}) exceed gross earnings ({formatINR(slip.grossEarnings)}).</div>
          )}
          {error && <div className="auth-error">{error}</div>}
          {ok && <div className="ledger-tieout ok" style={{ marginTop: '0.75rem' }}>{ok}</div>}
        </form>
      </div>

      <div className="settings-section">
        <h3>Salary Register — {monthLabel(month)}</h3>
        {monthRows.length === 0 ? (
          <p className="text-muted">Nobody paid for this month yet.</p>
        ) : (
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff</th><th>Role</th><th>Gross</th><th>PF</th><th>ESI</th>
                  <th>TDS</th><th>Deductions</th><th>Net Paid</th><th>Paid On</th><th>Voucher</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.staffName}</td>
                    <td>{ROLE_LABELS[p.staffRole] || p.staffRole}</td>
                    <td>{formatINR(p.grossEarnings)}</td>
                    <td>{formatINR(p.deductions?.pf || 0)}</td>
                    <td>{formatINR(p.deductions?.esi || 0)}</td>
                    <td>{formatINR(p.deductions?.tds || 0)}</td>
                    <td>{formatINR(p.totalDeductions)}</td>
                    <td><strong>{formatINR(p.netSalary)}</strong></td>
                    <td>{formatDate(p.paidAt, 'date')}</td>
                    <td className="font-mono">{p.voucherNumber}</td>
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
