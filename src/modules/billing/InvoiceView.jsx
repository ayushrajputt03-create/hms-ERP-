import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToDocument, getDocument } from '@lib/db'
import { buildHospitalInvoicePDF } from '@lib/pdf'
import { formatINR, formatDate } from '@lib/utils'
import { PAYMENT_MODE_LABELS, PAYMENT_MODES, canBill, recordPayment, addCreditNote } from '@lib/billing'
import { useToast } from '@components/Toast'
import { ChevronLeft, Printer, IndianRupee, Undo2 } from 'lucide-react'

export default function InvoiceView() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const { staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()
  const toast = useToast()
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const mayBill = canBill(staffProfile?.role)

  useEffect(() => {
    if (!facilityId || !invoiceId) return
    // Live subscription (not a one-shot fetch) so a payment recorded from this
    // same screen — or by another billing clerk — reflects immediately.
    return subscribeToDocument(`facilities/${facilityId}/billing/${invoiceId}`, (doc) => {
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
  const total = Number(invoice.total ?? invoice.grandTotal ?? 0)
  const credited = Number(invoice.creditedAmount) || 0
  const balanceDue = invoice.balanceDue != null
    ? Number(invoice.balanceDue)
    : Math.max(total - credited - (Number(invoice.paidAmount) || 0), 0)
  const payments = invoice.payments || []
  const creditNotes = invoice.creditNotes || []
  const cancelled = invoice.paymentStatus === 'cancelled'

  // Department and consulting doctor aren't stored on the invoice itself — they
  // live on whichever visit/admission it was billed from, so they're fetched at
  // print time rather than duplicated into every invoice document.
  async function handlePrintPdf() {
    setPrinting(true)
    try {
      const [patient, source] = await Promise.all([
        invoice.patientId
          ? getDocument(`facilities/${facilityId}/patients/${invoice.patientId}`)
          : null,
        (async () => {
          const visitId = (invoice.sourceVisitIds || [])[0]
          if (visitId) return getDocument(`facilities/${facilityId}/opdVisits/${visitId}`)
          const admissionId = (invoice.sourceAdmissionIds || [])[0]
          if (admissionId) return getDocument(`facilities/${facilityId}/ipd/admissions/${admissionId}`)
          return null
        })(),
      ])
      const pdf = await buildHospitalInvoicePDF({
        facility: facilityConfig || {},
        patient,
        invoice: {
          ...invoice,
          departmentName: invoice.departmentName || source?.departmentName,
          doctorName: invoice.doctorName || source?.doctorName,
          cashierName: staffProfile?.name || '',
        },
      })
      pdf.save(`Invoice-${invoice.invoiceNumber || invoice.id}.pdf`)
    } catch (err) {
      console.error('Invoice PDF error:', err)
      toast.error('Failed to generate the invoice PDF.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div>
      <div className="page-header no-print">
        <button className="btn btn-outline" onClick={() => navigate('/billing')}>
          <ChevronLeft size={16} /> Back to Billing
        </button>
        <button className="btn btn-primary" onClick={handlePrintPdf} disabled={printing}>
          <Printer size={15} /> {printing ? 'Preparing…' : 'Print / Save PDF'}
        </button>
      </div>

      {mayBill && !cancelled && (
        <PaymentPanel
          invoice={invoice}
          balanceDue={balanceDue}
          payments={payments}
          creditNotes={creditNotes}
          toast={toast}
        />
      )}

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
          <div className="summary-row summary-row-total"><span>Total</span><span>{formatINR(total)}</span></div>
          {credited > 0 && (
            <div className="summary-row"><span>Credit Notes</span><span>− {formatINR(credited)}</span></div>
          )}
          <div className="summary-row"><span>Paid</span><span>{formatINR(invoice.paidAmount || 0)}</span></div>
          {balanceDue > 0 && !cancelled && (
            <div className="summary-row summary-row-total"><span>Balance Due</span><span>{formatINR(balanceDue)}</span></div>
          )}
          <div className="summary-row"><span>Payment Mode</span><span>{PAYMENT_MODE_LABELS[invoice.paymentMode] || invoice.paymentMode || '—'}</span></div>
        </div>

        {invoice.insuranceClaim && (
          <div className="invoice-insurance-note">
            Insurance / TPA: <strong>{invoice.insuranceClaim.tpaName}</strong> — status: {invoice.insuranceClaim.status}
          </div>
        )}

        {payments.length > 0 && (
          <div className="invoice-payments-block">
            <div className="invoice-label">Payment History</div>
            <table className="invoice-table">
              <thead>
                <tr><th>Date</th><th>Mode</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paymentDate, 'datetime')}</td>
                    <td>{PAYMENT_MODE_LABELS[p.mode] || p.mode}</td>
                    <td className="font-mono">{p.referenceNumber || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {creditNotes.length > 0 && (
          <div className="invoice-payments-block">
            <div className="invoice-label">Credit Notes</div>
            <table className="invoice-table">
              <thead>
                <tr><th>Date</th><th>Reason</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
              </thead>
              <tbody>
                {creditNotes.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.issuedAt, 'datetime')}</td>
                    <td>{c.reason}</td>
                    <td style={{ textAlign: 'right' }}>− {formatINR(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="invoice-foot text-muted">
          This is a computer-generated invoice.
        </div>
      </div>
    </div>
  )
}

function PaymentPanel({ invoice, balanceDue, payments, creditNotes, toast }) {
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('cash')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCreditForm, setShowCreditForm] = useState(false)
  const [creditReason, setCreditReason] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditSaving, setCreditSaving] = useState(false)

  const handlePay = async () => {
    const amt = Number(amount)
    if (!(amt > 0)) { toast.error('Enter a valid payment amount.'); return }
    if (amt > balanceDue + 0.01) { toast.error(`Amount exceeds balance due of ${formatINR(balanceDue)}.`); return }
    setSaving(true)
    try {
      await recordPayment({ invoiceId: invoice.id, amount: amt, mode, referenceNumber: reference.trim() })
      toast.success('Payment recorded.')
      setAmount(''); setReference('')
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  const handleCreditNote = async () => {
    const amt = Number(creditAmount)
    if (!creditReason.trim()) { toast.error('A credit note needs a reason.'); return }
    if (!(amt > 0)) { toast.error('Enter a valid credit note amount.'); return }
    setCreditSaving(true)
    try {
      await addCreditNote({ invoiceId: invoice.id, reason: creditReason.trim(), amount: amt })
      toast.success('Credit note issued.')
      setCreditReason(''); setCreditAmount(''); setShowCreditForm(false)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to issue credit note.')
    } finally {
      setCreditSaving(false)
    }
  }

  return (
    <div className="settings-section no-print">
      <div className="builder-patient">
        <div>
          <strong>Balance Due</strong>{' '}
          <span style={{ fontSize: '1.1rem' }}>{formatINR(balanceDue)}</span>
        </div>
        {payments.length > 0 && (
          <button className="btn btn-outline btn-sm" onClick={() => setShowCreditForm((v) => !v)}>
            <Undo2 size={14} /> Issue Credit Note
          </button>
        )}
      </div>

      {balanceDue > 0.01 && (
        <div className="form-row" style={{ alignItems: 'flex-end', marginTop: '0.75rem' }}>
          <div className="form-group">
            <label><IndianRupee size={13} /> Amount</label>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Up to ${formatINR(balanceDue)}`} />
          </div>
          <div className="form-group">
            <label>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Reference No.</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI/txn id (optional)" />
          </div>
          <button className="btn btn-primary" onClick={handlePay} disabled={saving}>
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      )}
      {balanceDue <= 0.01 && creditNotes.length === 0 && (
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Invoice fully paid.</p>
      )}

      {showCreditForm && (
        <div className="form-row" style={{ alignItems: 'flex-end', marginTop: '0.75rem' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Reason *</label>
            <input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="e.g. billing error, returned item" />
          </div>
          <div className="form-group">
            <label>Amount</label>
            <input type="number" min="0" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
          </div>
          <button className="btn btn-outline" onClick={handleCreditNote} disabled={creditSaving}>
            {creditSaving ? 'Saving…' : 'Issue Credit Note'}
          </button>
        </div>
      )}
    </div>
  )
}
