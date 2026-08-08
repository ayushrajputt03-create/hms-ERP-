import { useState, useEffect, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import { dispenseMedicine, isExpired, isNearExpiry } from '@lib/pharmacy'
import { formatINR, formatDate } from '@lib/utils'
import Modal from '@components/Modal'
import { useToast } from '@components/Toast'
import { PackageOpen, Search, ShoppingBag, Plus, Trash2, AlertTriangle } from 'lucide-react'

export default function DispenseTab({ medicines, batches }) {
  const { facilityId } = useFacility()
  const [visits, setVisits] = useState([])
  const [search, setSearch] = useState('')
  const [rxModal, setRxModal] = useState(null)
  const [walkIn, setWalkIn] = useState(false)

  useEffect(() => {
    if (!facilityId) return
    return subscribeToCollection(`facilities/${facilityId}/opdVisits`, (data) => {
      setVisits(data
        .filter((v) => v.status === 'completed' && v.prescription?.length > 0 && !v.dispensed)
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)))
    })
  }, [facilityId])

  const filtered = search.trim()
    ? visits.filter((v) => [v.patientUhid, v.patientName, v.tokenNumber]
        .some((f) => String(f || '').toLowerCase().includes(search.toLowerCase())))
    : visits

  return (
    <div>
      <div className="pharmacy-alerts">
        <div className="search-input" style={{ flex: 1, maxWidth: 380 }}>
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prescription by UHID, name, token…" />
        </div>
        <button className="btn btn-outline" onClick={() => setWalkIn(true)}>
          <ShoppingBag size={15} /> Walk-in Sale
        </button>
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
                  {v.prescription.length} medicine{v.prescription.length !== 1 ? 's' : ''} — Dr. {v.doctorName}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setRxModal(v)}>
                <PackageOpen size={14} /> Dispense
              </button>
            </div>
          ))}
        </div>
      )}

      {rxModal && (
        <DispenseModal
          title={`Dispense — ${rxModal.patientName}`}
          medicines={medicines} batches={batches}
          patientId={rxModal.patientId} opdVisitId={rxModal.id}
          prescription={rxModal.prescription}
          onClose={() => setRxModal(null)}
        />
      )}
      {walkIn && (
        <DispenseModal
          title="Walk-in Sale"
          medicines={medicines} batches={batches}
          patientId={null} opdVisitId={null}
          onClose={() => setWalkIn(false)}
        />
      )}
    </div>
  )
}

function DispenseModal({ title, medicines, batches, patientId, opdVisitId, prescription, onClose }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Batches with stock, grouped by medicine, earliest expiry first (FEFO).
  // Expired batches are excluded outright — they must never reach a patient.
  const batchesByMed = useMemo(() => {
    const map = {}
    batches
      .filter((b) => (Number(b.quantity) || 0) > 0 && !isExpired(b.expiryDate))
      .forEach((b) => {
        (map[b.medicineId] ||= []).push(b)
      })
    Object.values(map).forEach((arr) => arr.sort((a, b) =>
      String(a.expiryDate || '').localeCompare(String(b.expiryDate || ''))))
    return map
  }, [batches])

  const initialRows = () => {
    if (!prescription) return [{ medicineId: '', batchId: '', qty: 1 }]
    return prescription.map((p) => {
      const med = medicines.find((m) => (m.name || '').toLowerCase() === (p.medicine || '').toLowerCase())
      const firstBatch = med ? (batchesByMed[med.id] || [])[0] : null
      return { medicineId: med?.id || '', batchId: firstBatch?.id || '', qty: 1, prescribed: p }
    })
  }
  const [rows, setRows] = useState(initialRows)

  const updateRow = (i, field, value) => {
    setRows(rows.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, [field]: value }
      if (field === 'medicineId') next.batchId = (batchesByMed[value] || [])[0]?.id || ''
      return next
    }))
  }
  const addRow = () => setRows([...rows, { medicineId: '', batchId: '', qty: 1 }])
  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i))

  const batchById = useMemo(() => Object.fromEntries(batches.map((b) => [b.id, b])), [batches])
  const priceOf = (r) => Number(batchById[r.batchId]?.sellingPrice ?? medicines.find((m) => m.id === r.medicineId)?.sellingPrice) || 0
  const total = rows.reduce((s, r) => s + (r.batchId && r.qty > 0 ? Number(r.qty) * priceOf(r) : 0), 0)

  const handleDispense = async () => {
    const items = rows
      .filter((r) => r.medicineId && r.batchId && Number(r.qty) > 0)
      .map((r) => ({ medicineId: r.medicineId, batchId: r.batchId, quantity: Number(r.qty), unitPrice: priceOf(r) }))
    if (items.length === 0) { setError('Add at least one medicine with a batch and quantity.'); return }

    // Client-side stock pre-check (the RPC is the real gate under lock).
    for (const it of items) {
      const b = batchById[it.batchId]
      if (isExpired(b?.expiryDate)) {
        setError(`Batch ${b?.batchNumber} of ${b?.medicineName} expired on ${formatDate(b.expiryDate)} — cannot dispense.`)
        return
      }
      if ((Number(b?.quantity) || 0) < it.quantity) {
        setError(`Insufficient stock for ${b?.medicineName} (batch ${b?.batchNumber}, available ${b?.quantity ?? 0}).`)
        return
      }
    }

    setSaving(true); setError('')
    try {
      await dispenseMedicine({ patientId, opdVisitId, items })
      toast.success('Dispensed.')
      onClose()
    } catch (err) {
      console.error('Dispense error:', err)
      // Surface the RPC's clear "Insufficient stock for X" message (race-safe gate).
      setError(err.message || 'Failed to dispense.')
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      {error && <div className="auth-error"><AlertTriangle size={13} /> {error}</div>}

      {rows.map((row, i) => {
        const medBatches = batchesByMed[row.medicineId] || []
        const batch = batchById[row.batchId]
        return (
          <div key={i} className="dispense-row">
            {row.prescribed && (
              <div className="dispense-prescribed">
                <strong>{row.prescribed.medicine}</strong>
                <span className="text-muted"> {row.prescribed.dosage} — {row.prescribed.frequency} — {row.prescribed.duration}</span>
              </div>
            )}
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group">
                <label>Medicine</label>
                <select value={row.medicineId} onChange={(e) => updateRow(i, 'medicineId', e.target.value)}>
                  <option value="">Select…</option>
                  {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Batch (stock)</label>
                <select value={row.batchId} onChange={(e) => updateRow(i, 'batchId', e.target.value)} disabled={!row.medicineId}>
                  <option value="">{medBatches.length ? 'Select batch…' : 'No stock'}</option>
                  {medBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber} — {b.quantity} left
                      {b.expiryDate ? ` — exp ${formatDate(b.expiryDate)}${isNearExpiry(b.expiryDate) ? ' (expiring soon)' : ''}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Qty</label>
                <input type="number" min="1" max={batch?.quantity ?? 999} value={row.qty}
                  onChange={(e) => updateRow(i, 'qty', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input disabled value={batch ? formatINR(Number(row.qty || 0) * priceOf(row)) : '—'} />
              </div>
              {!prescription && (
                <button className="btn btn-icon btn-danger" onClick={() => removeRow(i)} style={{ marginBottom: '1rem' }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {!prescription && (
        <button className="btn btn-outline btn-sm" onClick={addRow}><Plus size={13} /> Add Item</button>
      )}

      <div className="form-actions">
        <strong style={{ marginRight: 'auto' }}>Total: {formatINR(total)}</strong>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleDispense} disabled={saving}>
          {saving ? 'Dispensing…' : 'Confirm Dispense'}
        </button>
      </div>
    </Modal>
  )
}
