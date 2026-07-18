import { useState } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import { updateDocument } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from '@lib/constants'
import Modal from '@components/Modal'
import { Download, Ban, IndianRupee } from 'lucide-react'

export default function InvoiceDetail({ invoice, onClose }) {
  const { user, staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()
  const { can } = usePermission()
  const [payMode, setPayMode] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const paid = invoice.paidAmount || 0
  const due = (invoice.grandTotal || 0) - paid
  const isCancelled = invoice.status === 'cancelled'
  const payments = invoice.payments ? Object.values(invoice.payments) : []

  const canDelete = can('billing', 'delete')
  const canUpdate = can('billing', 'update') || can('billing', 'create')

  const recordPayment = async () => {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return }
    if (amt > due) { setError(`Amount exceeds due balance (${formatINR(due)}).`); return }

    setSaving(true)
    setError('')
    try {
      const newPayments = [...payments, {
        mode: payMode,
        amount: amt,
        receivedBy: staffProfile?.name || user?.email,
        date: Date.now(),
      }]
      await updateDocument(`facilities/${facilityId}/billing/${invoice.id}`, {
        payments: newPayments,
        paidAmount: paid + amt,
      }, {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: 'payment_recorded', module: 'billing' },
      })
      setPayAmount('')
    } catch (err) {
      console.error('Payment error:', err)
      setError('Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  const cancelInvoice = async () => {
    if (!cancelReason.trim()) { setError('Cancellation reason is required.'); return }
    setSaving(true)
    setError('')
    try {
      await updateDocument(`facilities/${facilityId}/billing/${invoice.id}`, {
        status: 'cancelled',
        cancelledAt: Date.now(),
        cancelledBy: staffProfile?.name || user?.email,
        cancelReason: cancelReason.trim(),
      }, {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: 'invoice_cancelled', module: 'billing' },
      })
      setShowCancel(false)
    } catch (err) {
      console.error('Cancel error:', err)
      setError('Failed to cancel invoice.')
    } finally {
      setSaving(false)
    }
  }

  const downloadPDF = async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const fc = facilityConfig || {}
    let y = 15

    doc.setFontSize(16).setFont(undefined, 'bold')
    doc.text(fc.facilityName || 'Hospital', 105, y, { align: 'center' })
    y += 6
    doc.setFontSize(9).setFont(undefined, 'normal')
    doc.text([fc.address, `${fc.city || ''} ${fc.state || ''}`, `Ph: ${fc.phone || ''}`, fc.gstin ? `GSTIN: ${fc.gstin}` : ''].filter(Boolean).join(' | '), 105, y, { align: 'center' })
    y += 8
    doc.setLineWidth(0.5).line(15, y, 195, y)
    y += 8

    doc.setFontSize(13).setFont(undefined, 'bold')
    doc.text(isCancelled ? 'INVOICE (CANCELLED)' : 'INVOICE', 105, y, { align: 'center' })
    y += 10

    doc.setFontSize(10).setFont(undefined, 'normal')
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 15, y)
    doc.text(`Date: ${formatDate(invoice.invoiceDate, 'datetime')}`, 120, y)
    y += 6
    doc.text(`Patient: ${invoice.patientName}`, 15, y)
    doc.text(`UHID: ${invoice.patientUhid}`, 120, y)
    y += 10

    doc.setFont(undefined, 'bold')
    doc.text('#', 15, y)
    doc.text('Description', 25, y)
    doc.text('Amount', 175, y, { align: 'right' })
    y += 2
    doc.line(15, y, 195, y)
    y += 6
    doc.setFont(undefined, 'normal')

    ;(invoice.items || []).forEach((item, i) => {
      doc.text(String(i + 1), 15, y)
      const lines = doc.splitTextToSize(item.description || '', 130)
      doc.text(lines, 25, y)
      doc.text(formatINR(item.amount).replace('₹', 'Rs.'), 175, y, { align: 'right' })
      y += lines.length * 5 + 2
    })

    y += 4
    doc.line(120, y, 195, y)
    y += 6
    doc.text('Subtotal', 125, y)
    doc.text(formatINR(invoice.subtotal).replace('₹', 'Rs.'), 175, y, { align: 'right' })
    y += 6
    if (invoice.gstAmount > 0) {
      doc.text(`GST (${invoice.gstRate}%)`, 125, y)
      doc.text(formatINR(invoice.gstAmount).replace('₹', 'Rs.'), 175, y, { align: 'right' })
      y += 6
    }
    doc.setFont(undefined, 'bold')
    doc.text('Grand Total', 125, y)
    doc.text(formatINR(invoice.grandTotal).replace('₹', 'Rs.'), 175, y, { align: 'right' })
    y += 6
    doc.setFont(undefined, 'normal')
    doc.text('Paid', 125, y)
    doc.text(formatINR(paid).replace('₹', 'Rs.'), 175, y, { align: 'right' })
    y += 6
    doc.text('Balance Due', 125, y)
    doc.text(formatINR(due).replace('₹', 'Rs.'), 175, y, { align: 'right' })

    if (isCancelled) {
      y += 10
      doc.setTextColor(220, 38, 38)
      doc.text(`Cancelled: ${invoice.cancelReason || ''}`, 15, y)
      doc.setTextColor(0, 0, 0)
    }

    doc.save(`${invoice.invoiceNumber}.pdf`)
  }

  return (
    <Modal isOpen onClose={onClose} title={`Invoice ${invoice.invoiceNumber}`} size="lg">
      {error && <div className="auth-error">{error}</div>}
      {isCancelled && (
        <div className="auth-error">
          Cancelled by {invoice.cancelledBy} on {formatDate(invoice.cancelledAt, 'datetime')} — Reason: {invoice.cancelReason}
        </div>
      )}

      <div className="consultation-header-bar" style={{ marginBottom: '1rem' }}>
        <div>
          <strong>{invoice.patientName}</strong> <span className="font-mono">{invoice.patientUhid}</span>
        </div>
        <div>{formatDate(invoice.invoiceDate, 'datetime')}</div>
      </div>

      <table className="data-table" style={{ marginBottom: '1rem' }}>
        <thead>
          <tr><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item, i) => (
            <tr key={i}>
              <td>{item.description}</td>
              <td style={{ textAlign: 'right' }}>{formatINR(item.amount)}</td>
            </tr>
          ))}
          <tr><td style={{ textAlign: 'right' }}><strong>Subtotal</strong></td><td style={{ textAlign: 'right' }}>{formatINR(invoice.subtotal)}</td></tr>
          {invoice.gstAmount > 0 && (
            <tr><td style={{ textAlign: 'right' }}>GST ({invoice.gstRate}%)</td><td style={{ textAlign: 'right' }}>{formatINR(invoice.gstAmount)}</td></tr>
          )}
          <tr>
            <td style={{ textAlign: 'right' }}><strong>Grand Total</strong></td>
            <td style={{ textAlign: 'right' }}><strong>{formatINR(invoice.grandTotal)}</strong></td>
          </tr>
          <tr>
            <td style={{ textAlign: 'right' }}>Paid / Due</td>
            <td style={{ textAlign: 'right' }}>
              <span style={{ color: 'var(--success)' }}>{formatINR(paid)}</span>
              {' / '}
              <span style={{ color: due > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatINR(due)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {payments.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Payments</h4>
          {payments.map((p, i) => (
            <div key={i} className="record-item">
              <span>{formatDate(p.date, 'datetime')}</span>
              <span className="badge badge-muted">{PAYMENT_MODE_LABELS[p.mode] || p.mode}</span>
              <span>{formatINR(p.amount)}</span>
              <span className="text-muted">by {p.receivedBy}</span>
            </div>
          ))}
        </div>
      )}

      {!isCancelled && due > 0 && canUpdate && (
        <div className="payment-row">
          <div className="form-group">
            <label><IndianRupee size={13} /> Record Payment</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select value={payMode} onChange={(e) => setPayMode(e.target.value)} style={{ maxWidth: 140 }}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
              </select>
              <input type="number" min="1" max={due} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={`Max ${due}`} />
              <button className="btn btn-primary" onClick={recordPayment} disabled={saving}>
                {saving ? '...' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="form-actions">
        {!isCancelled && canDelete && (
          <button className="btn btn-outline btn-danger" style={{ marginRight: 'auto' }} onClick={() => setShowCancel(true)}>
            <Ban size={14} /> Cancel Invoice
          </button>
        )}
        <button className="btn btn-outline" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={downloadPDF}>
          <Download size={14} /> Download PDF
        </button>
      </div>

      {showCancel && (
        <div className="cancel-box">
          <div className="form-group">
            <label>Cancellation Reason *</label>
            <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this invoice being cancelled?" />
          </div>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={() => setShowCancel(false)}>Back</button>
            <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={cancelInvoice} disabled={saving}>
              {saving ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
