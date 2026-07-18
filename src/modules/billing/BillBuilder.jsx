import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import {
  getPendingItems, computeTotals, createInvoiceFromVisits,
  PAYMENT_MODES, PAYMENT_MODE_LABELS, DEFAULT_GST_RATE,
} from '@lib/billing'
import { formatINR, formatDate } from '@lib/utils'
import { useToast } from '@components/Toast'
import {
  Receipt, Search, Plus, Trash2, User, IndianRupee, Loader, AlertTriangle,
} from 'lucide-react'

export default function BillBuilder() {
  const navigate = useNavigate()
  const { facilityId, facilityConfig } = useFacility()
  const toast = useToast()

  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [patient, setPatient] = useState(null)

  const [pending, setPending] = useState([])
  const [selected, setSelected] = useState({}) // visitId -> bool
  const [manualItems, setManualItems] = useState([])
  const [loadingPending, setLoadingPending] = useState(false)

  const [discount, setDiscount] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [tpaName, setTpaName] = useState('')
  const [saving, setSaving] = useState(false)

  const gstEnabled = !!facilityConfig?.gstEnabled
  const gstRate = Number(facilityConfig?.gstRate) || DEFAULT_GST_RATE

  useEffect(() => {
    if (!facilityId) return
    return subscribeToCollection(`facilities/${facilityId}/patients`, (data) => {
      setPatients(data.filter((p) => p.status !== 'archived'))
    })
  }, [facilityId])

  const matches = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return patients.filter((p) =>
      [p.name, p.uhid, p.phone].some((f) => String(f || '').toLowerCase().includes(q))
    ).slice(0, 8)
  }, [search, patients])

  const selectPatient = async (p) => {
    setPatient(p)
    setSearch('')
    setManualItems([])
    setDiscount(''); setDiscountReason(''); setPaymentMode('cash'); setTpaName('')
    setLoadingPending(true)
    try {
      const items = await getPendingItems(facilityId, p.id)
      setPending(items)
      setSelected(Object.fromEntries(items.map((i) => [i.visitId, true])))
    } catch (err) {
      console.error(err)
      toast.error('Failed to load pending items.')
    } finally {
      setLoadingPending(false)
    }
  }

  const selectedVisits = pending.filter((i) => selected[i.visitId])
  const validManual = manualItems.filter((m) => m.description.trim() && Number(m.amount) > 0)

  const lineItems = [
    ...selectedVisits.map((v) => ({ description: v.description, source: v.source, amount: v.amount })),
    ...validManual.map((m) => ({ description: m.description.trim(), source: 'manual', amount: Number(m.amount) })),
  ]

  const { subtotal, gstAmount, total } = computeTotals({
    items: lineItems, gstEnabled, gstRate, discount: Number(discount) || 0,
  })

  const discountInvalid = Number(discount) > 0 && !discountReason.trim()

  const addManual = () => setManualItems([...manualItems, { description: '', amount: '' }])
  const updateManual = (i, f, val) => setManualItems(manualItems.map((m, idx) => idx === i ? { ...m, [f]: val } : m))
  const removeManual = (i) => setManualItems(manualItems.filter((_, idx) => idx !== i))

  const handleGenerate = async () => {
    if (selectedVisits.length === 0) {
      toast.error('Select at least one OPD visit to bill.')
      return
    }
    if (discountInvalid) {
      toast.error('A discount needs a reason before it can be saved.')
      return
    }
    setSaving(true)
    try {
      const insurance = paymentMode === 'insurance'
        ? { tpaName: tpaName.trim() || 'Unspecified', status: 'submitted', notes: '' }
        : null
      const invoiceId = await createInvoiceFromVisits({
        visitIds: selectedVisits.map((v) => v.visitId),
        lineItems,
        subtotal,
        gstAmount,
        discount: Number(discount) || 0,
        discountReason: discountReason.trim() || null,
        total,
        paymentMode,
        insurance,
      })
      toast.success('Invoice generated.')
      navigate(`/billing/invoice/${invoiceId}`)
    } catch (err) {
      console.error('Invoice error:', err)
      // Surface the RPC's clear message (already billed / discount reason / role / module).
      toast.error(err.message || 'Failed to generate invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bill-builder">
      <div className="page-header">
        <div>
          <h2><Receipt size={22} /> Bill Builder</h2>
          <p>Create an invoice from a patient's un-billed activity</p>
        </div>
      </div>

      {!patient ? (
        <div className="settings-section">
          <div className="search-input" style={{ maxWidth: 480 }}>
            <Search size={16} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient by name, UHID, or phone..."
            />
          </div>
          {matches.length > 0 && (
            <div className="patient-search-results">
              {matches.map((p) => (
                <button key={p.id} className="patient-search-row" onClick={() => selectPatient(p)}>
                  <User size={15} />
                  <span className="psr-name">{p.name}</span>
                  <span className="font-mono">{p.uhid || '—'}</span>
                  <span className="text-muted">{p.phone}</span>
                </button>
              ))}
            </div>
          )}
          {search.trim() && matches.length === 0 && (
            <p className="text-muted" style={{ marginTop: '0.75rem' }}>No patients match "{search}".</p>
          )}
        </div>
      ) : (
        <div className="invoice-builder">
          {/* LEFT: line items */}
          <div className="invoice-items-panel">
            <div className="builder-patient">
              <div>
                <strong>{patient.name}</strong>{' '}
                <span className="font-mono">{patient.uhid || ''}</span>
                <span className="text-muted"> — {patient.phone}</span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => { setPatient(null); setPending([]) }}>
                Change
              </button>
            </div>

            <h4 style={{ margin: '1rem 0 0.5rem' }}>Un-billed OPD Visits</h4>
            {loadingPending ? (
              <p className="text-muted"><Loader size={14} className="loading-icon" /> Loading…</p>
            ) : pending.length === 0 ? (
              <p className="text-muted">No un-billed OPD visits for this patient. Add manual items below, or bill after a consultation is completed.</p>
            ) : (
              <div className="test-checklist">
                {pending.map((v) => (
                  <label key={v.visitId} className="checkbox-label test-check-item">
                    <input
                      type="checkbox"
                      checked={!!selected[v.visitId]}
                      onChange={() => setSelected({ ...selected, [v.visitId]: !selected[v.visitId] })}
                    />
                    <span>{v.description}<br /><span className="text-muted" style={{ fontSize: '0.72rem' }}>{formatDate(v.date, 'datetime')}</span></span>
                    <span style={{ marginLeft: 'auto' }}>{formatINR(v.amount)}</span>
                  </label>
                ))}
              </div>
            )}

            <h4 style={{ margin: '1.25rem 0 0.5rem' }}>Manual Items</h4>
            {manualItems.map((m, i) => (
              <div key={i} className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Description</label>
                  <input value={m.description} onChange={(e) => updateManual(i, 'description', e.target.value)} placeholder="e.g. Dressing, Injection charge" />
                </div>
                <div className="form-group">
                  <label>Amount (₹)</label>
                  <input type="number" min="0" value={m.amount} onChange={(e) => updateManual(i, 'amount', e.target.value)} />
                </div>
                <button className="btn btn-icon btn-danger" onClick={() => removeManual(i)} style={{ marginBottom: '1rem' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button className="btn btn-outline btn-sm" onClick={addManual}><Plus size={13} /> Add Manual Item</button>
          </div>

          {/* RIGHT: summary */}
          <div className="invoice-summary-panel">
            <h4 style={{ marginBottom: '0.75rem' }}>Summary</h4>
            <div className="summary-row"><span>Subtotal</span><span>{formatINR(subtotal)}</span></div>
            {gstEnabled && <div className="summary-row"><span>GST ({gstRate}%)</span><span>{formatINR(gstAmount)}</span></div>}

            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Discount (₹)</label>
              <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </div>
            {Number(discount) > 0 && (
              <div className="form-group">
                <label className={discountInvalid ? 'label-danger' : ''}>Discount Reason *</label>
                <input
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="Required — e.g. senior citizen, camp"
                  style={discountInvalid ? { borderColor: 'var(--danger)' } : undefined}
                />
                {discountInvalid && (
                  <span className="dispense-stock-warn"><AlertTriangle size={11} /> A discount can't be saved without a reason.</span>
                )}
              </div>
            )}

            <div className="summary-row summary-row-total"><span>Total</span><span>{formatINR(total)}</span></div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label><IndianRupee size={13} /> Payment Mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
              </select>
            </div>
            {paymentMode === 'insurance' && (
              <div className="form-group">
                <label>TPA / Insurer Name</label>
                <input value={tpaName} onChange={(e) => setTpaName(e.target.value)} placeholder="e.g. Star Health" />
              </div>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: '1rem' }}
              onClick={handleGenerate}
              disabled={saving || selectedVisits.length === 0 || discountInvalid}
            >
              {saving ? 'Generating…' : `Generate Invoice — ${formatINR(total)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
