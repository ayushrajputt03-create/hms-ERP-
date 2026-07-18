import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFacility } from '@hooks/useFacility'
import { getDocument } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import { PAYMENT_MODE_LABELS } from '@lib/billing'
import { ChevronLeft, Printer } from 'lucide-react'

export default function InvoiceView() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const { facilityId, facilityConfig } = useFacility()
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!facilityId || !invoiceId) return
    getDocument(`facilities/${facilityId}/billing/${invoiceId}`).then((doc) => {
      setInvoice(doc)
      setLoading(false)
    })
  }, [facilityId, invoiceId])

  if (loading) return <div className="empty-state">Loading invoice…</div>
  if (!invoice) return <div className="empty-state">Invoice not found.</div>

  const fc = facilityConfig || {}
  const gstEnabled = !!fc.gstEnabled
  const items = invoice.lineItems || invoice.items || []
  const paid = invoice.paymentStatus === 'paid'

  return (
    <div>
      <div className="page-header no-print">
        <button className="btn btn-outline" onClick={() => navigate('/billing')}>
          <ChevronLeft size={16} /> Back to Billing
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      <div className="invoice-sheet">
        <div className="invoice-brand">
          <div>
            <h1>{fc.facilityName || 'Facility'}</h1>
            <p>
              {[fc.address, fc.city, fc.state, fc.pincode].filter(Boolean).join(', ')}
            </p>
            <p>
              {fc.phone && <>Ph: {fc.phone}</>}
              {fc.email && <> · {fc.email}</>}
            </p>
            {gstEnabled && fc.gstin && <p>GSTIN: {fc.gstin}</p>}
          </div>
          <div className="invoice-brand-tag">
            <span className={`badge ${paid ? 'badge-success' : invoice.paymentStatus === 'cancelled' ? 'badge-danger' : 'badge-warning'}`}>
              {invoice.paymentStatus === 'cancelled' ? 'Cancelled' : paid ? 'Paid' : (invoice.paymentStatus || 'Pending')}
            </span>
          </div>
        </div>

        <div className="invoice-meta-row">
          <div>
            <div className="invoice-label">Invoice</div>
            <div className="font-mono invoice-number">{invoice.invoiceNumber}</div>
            <div className="text-muted">{formatDate(invoice.invoiceDate, 'datetime')}</div>
          </div>
          <div>
            <div className="invoice-label">Billed To</div>
            <div><strong>{invoice.patientName}</strong></div>
            <div className="font-mono text-muted">{invoice.patientUhid}</div>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr><th>#</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{it.description}</td>
                <td style={{ textAlign: 'right' }}>{formatINR(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals-box">
          <div className="summary-row"><span>Subtotal</span><span>{formatINR(invoice.subtotal)}</span></div>
          {invoice.gstAmount > 0 && (
            <div className="summary-row"><span>GST</span><span>{formatINR(invoice.gstAmount)}</span></div>
          )}
          {invoice.discount > 0 && (
            <div className="summary-row">
              <span>Discount{invoice.discountReason ? ` (${invoice.discountReason})` : ''}</span>
              <span>− {formatINR(invoice.discount)}</span>
            </div>
          )}
          <div className="summary-row summary-row-total"><span>Total</span><span>{formatINR(invoice.total ?? invoice.grandTotal)}</span></div>
          <div className="summary-row"><span>Payment Mode</span><span>{PAYMENT_MODE_LABELS[invoice.paymentMode] || invoice.paymentMode || '—'}</span></div>
        </div>

        {invoice.insuranceClaim && (
          <div className="invoice-insurance-note">
            Insurance / TPA: <strong>{invoice.insuranceClaim.tpaName}</strong> — status: {invoice.insuranceClaim.status}
          </div>
        )}

        <div className="invoice-foot text-muted">
          This is a computer-generated invoice.
        </div>
      </div>
    </div>
  )
}
