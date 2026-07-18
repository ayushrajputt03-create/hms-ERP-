import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import { subscribeToCollection, incrementCounter, addDocument, updateDocument } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import InvoiceDetail from './InvoiceDetail'
import Modal from '@components/Modal'
import { Receipt, FileText, Clock, Plus, Trash2 } from 'lucide-react'

export default function BillingPage() {
  const { user, staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()
  const { can } = usePermission()
  const [tab, setTab] = useState('pending')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [invoiceModal, setInvoiceModal] = useState(null)
  const [detailInvoice, setDetailInvoice] = useState(null)

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    return subscribeToCollection(`facilities/${facilityId}/billing`, (data) => {
      setRecords(data.sort((a, b) => (b.invoiceDate || b.createdAt || 0) - (a.invoiceDate || a.createdAt || 0)))
      setLoading(false)
    })
  }, [facilityId])

  const charges = records.filter((r) => r.type !== 'invoice')
  const invoices = records.filter((r) => r.type === 'invoice')
  const pendingCharges = charges.filter((c) => c.status === 'pending')

  const pendingByPatient = useMemo(() => {
    const groups = {}
    pendingCharges.forEach((c) => {
      const key = c.patientId || 'unknown'
      if (!groups[key]) groups[key] = { patientId: c.patientId, patientName: c.patientName, patientUhid: c.patientUhid, items: [] }
      groups[key].items.push(c)
    })
    return Object.values(groups)
  }, [pendingCharges])

  const canCreate = can('billing', 'create')

  if (loading) return <div className="empty-state">Loading billing data...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><Receipt size={22} /> Billing & Invoicing</h2>
          <p>{pendingCharges.length} pending charge{pendingCharges.length !== 1 ? 's' : ''} — {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          <Clock size={15} /> Pending Charges {pendingByPatient.length > 0 && <span className="badge badge-warning">{pendingByPatient.length}</span>}
        </button>
        <button className={`tab ${tab === 'invoices' ? 'active' : ''}`} onClick={() => setTab('invoices')}>
          <FileText size={15} /> Invoices
        </button>
      </div>

      {tab === 'pending' && (
        pendingByPatient.length === 0 ? (
          <div className="empty-state">No pending charges. Charges appear here automatically from OPD visits, pharmacy dispensing, lab orders, and IPD discharges.</div>
        ) : (
          <div className="queue-list">
            {pendingByPatient.map((group) => {
              const total = group.items.reduce((s, i) => s + (i.amount || 0), 0)
              return (
                <div key={group.patientId} className="queue-card">
                  <div className="queue-patient-info">
                    <div className="queue-patient-name">{group.patientName}</div>
                    <div className="queue-patient-meta"><span className="font-mono">{group.patientUhid}</span></div>
                    <div className="queue-doctor-name">
                      {group.items.length} charge{group.items.length !== 1 ? 's' : ''}: {group.items.map((i) => i.type?.replace('_', ' ')).join(', ')}
                    </div>
                  </div>
                  <strong>{formatINR(total)}</strong>
                  {canCreate && (
                    <button className="btn btn-primary btn-sm" onClick={() => setInvoiceModal(group)}>
                      Create Invoice
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {tab === 'invoices' && (
        invoices.length === 0 ? (
          <div className="empty-state">No invoices generated yet.</div>
        ) : (
          <div className="queue-list">
            {invoices.map((inv) => (
              <div key={inv.id} className="queue-card" style={{ cursor: 'pointer' }} onClick={() => setDetailInvoice(inv)}>
                <div className="queue-patient-info">
                  <div className="queue-patient-name">
                    <span className="font-mono">{inv.invoiceNumber}</span> — {inv.patientName}
                  </div>
                  <div className="queue-patient-meta">
                    {formatDate(inv.invoiceDate, 'datetime')} — {(inv.items || []).length} item{(inv.items || []).length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>{formatINR(inv.grandTotal)}</strong>
                  <div>
                    <span className={`badge ${
                      inv.status === 'cancelled' ? 'badge-danger'
                        : inv.paidAmount >= inv.grandTotal ? 'badge-success'
                        : inv.paidAmount > 0 ? 'badge-warning' : 'badge-muted'
                    }`}>
                      {inv.status === 'cancelled' ? 'Cancelled'
                        : inv.paidAmount >= inv.grandTotal ? 'Paid'
                        : inv.paidAmount > 0 ? `Due ${formatINR(inv.grandTotal - inv.paidAmount)}` : 'Unpaid'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {invoiceModal && (
        <CreateInvoiceModal
          group={invoiceModal}
          onClose={() => setInvoiceModal(null)}
          facilityId={facilityId}
          facilityConfig={facilityConfig}
          performedBy={staffProfile?.name || user?.email}
        />
      )}

      {detailInvoice && (
        <InvoiceDetail
          invoice={records.find((r) => r.id === detailInvoice.id) || detailInvoice}
          onClose={() => setDetailInvoice(null)}
        />
      )}
    </div>
  )
}

function CreateInvoiceModal({ group, onClose, facilityId, facilityConfig, performedBy }) {
  const [selected, setSelected] = useState(group.items.map((i) => i.id))
  const [manualItems, setManualItems] = useState([])
  const [applyGst, setApplyGst] = useState(!!facilityConfig?.gstEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const gstRate = Number(facilityConfig?.gstRate) || 18

  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const addManual = () => setManualItems([...manualItems, { description: '', amount: '' }])
  const updateManual = (i, field, value) => setManualItems(manualItems.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  const removeManual = (i) => setManualItems(manualItems.filter((_, idx) => idx !== i))

  const selectedCharges = group.items.filter((i) => selected.includes(i.id))
  const validManual = manualItems.filter((m) => m.description.trim() && Number(m.amount))
  const subtotal = selectedCharges.reduce((s, i) => s + (i.amount || 0), 0)
    + validManual.reduce((s, m) => s + Number(m.amount), 0)
  const gstAmount = applyGst ? Math.round(subtotal * gstRate) / 100 : 0
  const grandTotal = subtotal + gstAmount

  const handleCreate = async () => {
    if (selectedCharges.length === 0 && validManual.length === 0) {
      setError('Select at least one charge or add a manual item.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const seq = await incrementCounter(`facilities/${facilityId}/counters/invoice`)
      const invoiceNumber = `${facilityConfig?.invoicePrefix || 'INV'}-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`

      const items = [
        ...selectedCharges.map((c) => ({ chargeId: c.id, description: c.description, type: c.type, amount: c.amount || 0 })),
        ...validManual.map((m) => ({ description: m.description.trim(), type: 'manual', amount: Number(m.amount) })),
      ]

      await addDocument(`facilities/${facilityId}/billing`, {
        type: 'invoice',
        invoiceNumber,
        patientId: group.patientId,
        patientName: group.patientName,
        patientUhid: group.patientUhid,
        items,
        subtotal,
        gstRate: applyGst ? gstRate : 0,
        gstAmount,
        grandTotal,
        paidAmount: 0,
        payments: [],
        status: 'active',
        invoiceDate: Date.now(),
        createdBy: performedBy,
        facilityId,
      }, {
        user: performedBy, facilityId,
        audit: { action: 'invoice_created', module: 'billing' },
      })

      for (const c of selectedCharges) {
        await updateDocument(`facilities/${facilityId}/billing/${c.id}`, { status: 'invoiced' })
      }

      onClose()
    } catch (err) {
      console.error('Invoice error:', err)
      setError('Failed to create invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Create Invoice — ${group.patientName}`} size="lg">
      {error && <div className="auth-error">{error}</div>}

      <h4 style={{ marginBottom: '0.5rem' }}>Pending Charges</h4>
      <div className="test-checklist" style={{ marginBottom: '1rem' }}>
        {group.items.map((c) => (
          <label key={c.id} className="checkbox-label test-check-item">
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
            <span>{c.description}</span>
            <span style={{ marginLeft: 'auto' }}>{formatINR(c.amount)}</span>
          </label>
        ))}
      </div>

      <h4 style={{ marginBottom: '0.5rem' }}>Manual Items</h4>
      {manualItems.map((m, i) => (
        <div key={i} className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Description</label>
            <input value={m.description} onChange={(e) => updateManual(i, 'description', e.target.value)} placeholder="e.g. Ambulance charges" />
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

      <div className="invoice-totals">
        <div><span>Subtotal</span><span>{formatINR(subtotal)}</span></div>
        <label className="checkbox-label">
          <input type="checkbox" checked={applyGst} onChange={(e) => setApplyGst(e.target.checked)} />
          Apply GST ({gstRate}%)
        </label>
        {applyGst && <div><span>GST</span><span>{formatINR(gstAmount)}</span></div>}
        <div className="invoice-grand"><span>Grand Total</span><span>{formatINR(grandTotal)}</span></div>
      </div>

      <div className="form-actions">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
          {saving ? 'Creating...' : 'Generate Invoice'}
        </button>
      </div>
    </Modal>
  )
}
