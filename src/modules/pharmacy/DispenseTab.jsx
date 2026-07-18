import { useState, useEffect } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument, adjustValue } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import Modal from '@components/Modal'
import { PackageOpen, Search, ShoppingBag } from 'lucide-react'

export default function DispenseTab({ medicines, canWrite }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [visits, setVisits] = useState([])
  const [search, setSearch] = useState('')
  const [dispenseModal, setDispenseModal] = useState(null)
  const [walkInModal, setWalkInModal] = useState(false)

  useEffect(() => {
    if (!facilityId) return
    return subscribeToCollection(`facilities/${facilityId}/opdVisits`, (data) => {
      setVisits(
        data
          .filter((v) => v.status === 'completed' && v.prescription?.length > 0 && !v.dispensed)
          .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
      )
    })
  }, [facilityId])

  const filtered = search.trim()
    ? visits.filter((v) => {
        const q = search.toLowerCase()
        return (v.patientUhid || '').toLowerCase().includes(q)
          || (v.patientName || '').toLowerCase().includes(q)
          || String(v.tokenNumber || '').includes(q)
      })
    : visits

  return (
    <div>
      <div className="pharmacy-alerts">
        <div className="search-input" style={{ flex: 1, maxWidth: 380 }}>
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by UHID, patient name, or token..."
          />
        </div>
        {canWrite && (
          <button className="btn btn-outline" onClick={() => setWalkInModal(true)}>
            <ShoppingBag size={15} /> Walk-in Sale
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No pending prescriptions to dispense.</div>
      ) : (
        <div className="queue-list">
          {filtered.map((v) => (
            <div key={v.id} className="queue-card">
              <div className="queue-patient-info">
                <div className="queue-patient-name">{v.patientName}</div>
                <div className="queue-patient-meta">
                  <span className="font-mono">{v.patientUhid}</span>
                  <span> — Token #{v.tokenNumber} — {formatDate(v.completedAt, 'datetime')}</span>
                </div>
                <div className="queue-doctor-name">
                  {v.prescription.length} medicine{v.prescription.length !== 1 ? 's' : ''} prescribed by Dr. {v.doctorName}
                </div>
              </div>
              {canWrite && (
                <button className="btn btn-primary btn-sm" onClick={() => setDispenseModal(v)}>
                  <PackageOpen size={14} /> Dispense
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {dispenseModal && (
        <DispenseModal
          visit={dispenseModal}
          medicines={medicines}
          onClose={() => setDispenseModal(null)}
          facilityId={facilityId}
          performedBy={staffProfile?.name || user?.email}
        />
      )}

      {walkInModal && (
        <WalkInModal
          medicines={medicines}
          onClose={() => setWalkInModal(false)}
          facilityId={facilityId}
          performedBy={staffProfile?.name || user?.email}
        />
      )}
    </div>
  )
}

function DispenseModal({ visit, medicines, onClose, facilityId, performedBy }) {
  const [rows, setRows] = useState(
    visit.prescription.map((p) => ({
      prescribed: p,
      medicineId: medicines.find((m) => m.name.toLowerCase() === (p.medicine || '').toLowerCase())?.id || '',
      qty: 1,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateRow = (i, field, value) => {
    setRows(rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const handleDispense = async () => {
    const toDispense = rows.filter((r) => r.medicineId && Number(r.qty) > 0)
    if (toDispense.length === 0) { setError('Select at least one medicine with quantity.'); return }

    for (const row of toDispense) {
      const med = medicines.find((m) => m.id === row.medicineId)
      if (!med) continue
      if (Number(row.qty) > (med.quantity ?? 0)) {
        setError(`Insufficient stock for ${med.name} (available: ${med.quantity ?? 0}).`)
        return
      }
    }

    setSaving(true)
    setError('')
    try {
      const items = []
      let total = 0
      for (const row of toDispense) {
        const med = medicines.find((m) => m.id === row.medicineId)
        const qty = Number(row.qty)
        const amount = qty * (med.unitPrice || 0)
        await adjustValue(`facilities/${facilityId}/pharmacy/medicines/${row.medicineId}/quantity`, -qty)
        items.push({ medicineId: row.medicineId, name: med.name, qty, unitPrice: med.unitPrice || 0, amount })
        total += amount
      }

      await addDocument(`facilities/${facilityId}/pharmacy/sales`, {
        type: 'prescription',
        visitId: visit.id,
        patientId: visit.patientId,
        patientName: visit.patientName,
        patientUhid: visit.patientUhid,
        items,
        total,
        dispensedBy: performedBy,
        saleDate: Date.now(),
      }, {
        user: performedBy, facilityId,
        audit: { action: 'medicines_dispensed', module: 'pharmacy' },
      })

      await addDocument(`facilities/${facilityId}/billing`, {
        patientId: visit.patientId,
        patientName: visit.patientName,
        patientUhid: visit.patientUhid,
        type: 'pharmacy',
        description: `Pharmacy — ${items.map((i) => `${i.name} ×${i.qty}`).join(', ')}`,
        amount: total,
        status: 'pending',
        visitId: visit.id,
        invoiceDate: Date.now(),
        facilityId,
      })

      await updateDocument(`facilities/${facilityId}/opdVisits/${visit.id}`, {
        dispensed: true, dispensedAt: Date.now(),
      })

      onClose()
    } catch (err) {
      console.error('Dispense error:', err)
      setError('Failed to dispense. Please retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Dispense — ${visit.patientName}`} size="lg">
      {error && <div className="auth-error">{error}</div>}
      {rows.map((row, i) => {
        const med = medicines.find((m) => m.id === row.medicineId)
        return (
          <div key={i} className="dispense-row">
            <div className="dispense-prescribed">
              <strong>{row.prescribed.medicine}</strong>
              <span className="text-muted"> {row.prescribed.dosage} — {row.prescribed.frequency} — {row.prescribed.duration}</span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Stock Item</label>
                <select value={row.medicineId} onChange={(e) => updateRow(i, 'medicineId', e.target.value)}>
                  <option value="">Not in stock / skip</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} (stock: {m.quantity ?? 0})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Qty</label>
                <input type="number" min="0" max={med?.quantity ?? 999} value={row.qty}
                  onChange={(e) => updateRow(i, 'qty', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input disabled value={med ? formatINR(Number(row.qty || 0) * (med.unitPrice || 0)) : '—'} />
              </div>
            </div>
          </div>
        )
      })}
      <div className="form-actions">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleDispense} disabled={saving}>
          {saving ? 'Dispensing...' : 'Confirm Dispense'}
        </button>
      </div>
    </Modal>
  )
}

function WalkInModal({ medicines, onClose, facilityId, performedBy }) {
  const [items, setItems] = useState([{ medicineId: '', qty: 1 }])
  const [customerName, setCustomerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateItem = (i, field, value) => {
    setItems(items.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const total = items.reduce((sum, it) => {
    const med = medicines.find((m) => m.id === it.medicineId)
    return sum + (med ? Number(it.qty || 0) * (med.unitPrice || 0) : 0)
  }, 0)

  const handleSale = async () => {
    const valid = items.filter((it) => it.medicineId && Number(it.qty) > 0)
    if (valid.length === 0) { setError('Add at least one medicine.'); return }
    for (const it of valid) {
      const med = medicines.find((m) => m.id === it.medicineId)
      if (Number(it.qty) > (med?.quantity ?? 0)) {
        setError(`Insufficient stock for ${med?.name} (available: ${med?.quantity ?? 0}).`)
        return
      }
    }

    setSaving(true)
    setError('')
    try {
      const saleItems = []
      for (const it of valid) {
        const med = medicines.find((m) => m.id === it.medicineId)
        const qty = Number(it.qty)
        await adjustValue(`facilities/${facilityId}/pharmacy/medicines/${it.medicineId}/quantity`, -qty)
        saleItems.push({ medicineId: it.medicineId, name: med.name, qty, unitPrice: med.unitPrice || 0, amount: qty * (med.unitPrice || 0) })
      }
      await addDocument(`facilities/${facilityId}/pharmacy/sales`, {
        type: 'walk_in',
        customerName: customerName.trim() || 'Walk-in customer',
        items: saleItems,
        total,
        dispensedBy: performedBy,
        saleDate: Date.now(),
      }, {
        user: performedBy, facilityId,
        audit: { action: 'walk_in_sale', module: 'pharmacy' },
      })
      onClose()
    } catch (err) {
      console.error('Walk-in sale error:', err)
      setError('Failed to record sale.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Walk-in Sale" size="md">
      {error && <div className="auth-error">{error}</div>}
      <div className="form-group">
        <label>Customer Name</label>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" />
      </div>
      {items.map((it, i) => (
        <div key={i} className="form-row">
          <div className="form-group">
            <label>Medicine</label>
            <select value={it.medicineId} onChange={(e) => updateItem(i, 'medicineId', e.target.value)}>
              <option value="">Select...</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>{m.name} (stock: {m.quantity ?? 0}) — {formatINR(m.unitPrice)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Qty</label>
            <input type="number" min="1" value={it.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} />
          </div>
        </div>
      ))}
      <button className="btn btn-outline btn-sm" onClick={() => setItems([...items, { medicineId: '', qty: 1 }])}>
        + Add Item
      </button>
      <div className="form-actions">
        <strong style={{ marginRight: 'auto' }}>Total: {formatINR(total)}</strong>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSale} disabled={saving}>
          {saving ? 'Saving...' : 'Complete Sale'}
        </button>
      </div>
    </Modal>
  )
}
