import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatINR, formatDate, toISODate } from '@lib/utils'
import { PAYMENT_MODE_LABELS } from '@lib/billing'
import { Download, TrendingUp } from 'lucide-react'

export default function CollectionReport({ invoices }) {
  const navigate = useNavigate()
  const today = toISODate(new Date())

  const todaysInvoices = useMemo(
    () => invoices.filter((inv) => inv.invoiceDate && toISODate(new Date(inv.invoiceDate)) === today && inv.paymentStatus !== 'cancelled'),
    [invoices, today]
  )

  const byMode = useMemo(() => {
    const acc = {}
    todaysInvoices.forEach((inv) => {
      const mode = inv.paymentMode || 'cash'
      acc[mode] = (acc[mode] || 0) + (Number(inv.paidAmount) || 0)
    })
    return acc
  }, [todaysInvoices])

  const totalCollected = Object.values(byMode).reduce((s, v) => s + v, 0)
  // Oldest-first — the invoices that have been outstanding longest surface at
  // the top, since those are the ones collections should chase first.
  const pendingDues = useMemo(
    () => invoices
      .filter((inv) => inv.paymentStatus === 'pending' || inv.paymentStatus === 'partially_paid')
      .sort((a, b) => (a.invoiceDate || 0) - (b.invoiceDate || 0)),
    [invoices]
  )

  const exportCSV = () => {
    const rows = [
      ['Invoice', 'Patient', 'UHID', 'Date', 'Payment Mode', 'Status', 'Total', 'Paid'],
      ...invoices
        .filter((inv) => inv.paymentStatus !== 'cancelled')
        .map((inv) => [
          inv.invoiceNumber, inv.patientName, inv.patientUhid,
          formatDate(inv.invoiceDate, 'datetime'),
          PAYMENT_MODE_LABELS[inv.paymentMode] || inv.paymentMode || '',
          inv.paymentStatus || '', inv.total ?? inv.grandTotal ?? 0, inv.paidAmount ?? 0,
        ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `collection-report-${today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="report-summary-grid">
        <div className="stat-card stat-card-green">
          <div className="stat-card-icon"><TrendingUp size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value">{formatINR(totalCollected)}</span>
            <span className="stat-card-label">Collected Today</span>
            <span className="stat-card-sub">{todaysInvoices.length} invoice{todaysInvoices.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {Object.entries(byMode).map(([mode, amt]) => (
          <div key={mode} className="stat-card stat-card-teal">
            <div className="stat-card-content">
              <span className="stat-card-value">{formatINR(amt)}</span>
              <span className="stat-card-label">{PAYMENT_MODE_LABELS[mode] || mode}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pharmacy-alerts">
        <h3 style={{ fontSize: '1rem' }}>Pending Dues ({pendingDues.length})</h3>
        <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={exportCSV}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {pendingDues.length === 0 ? (
        <div className="empty-state">No pending dues. 🎉</div>
      ) : (
        <div className="queue-list">
          {pendingDues.map((inv) => (
            <div key={inv.id} className="queue-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/billing/invoice/${inv.id}`)}>
              <div className="queue-patient-info">
                <div className="queue-patient-name">
                  <span className="font-mono">{inv.invoiceNumber}</span> — {inv.patientName}
                </div>
                <div className="queue-patient-meta">
                  {formatDate(inv.invoiceDate, 'datetime')} — {PAYMENT_MODE_LABELS[inv.paymentMode] || inv.paymentMode}
                </div>
              </div>
              <strong>{formatINR(inv.balanceDue ?? (inv.total ?? inv.grandTotal))}</strong>
              <span className="badge badge-warning">{inv.paymentStatus === 'partially_paid' ? 'Partially Paid' : 'Pending'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
