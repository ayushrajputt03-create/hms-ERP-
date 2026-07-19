import { useState, useMemo } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { addDocument, updateDocument } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import { stockByMedicine, isNearExpiry, isExpired } from '@lib/pharmacy'
import DataTable from '@components/DataTable'
import Modal from '@components/Modal'
import { useToast } from '@components/Toast'
import { Plus, Edit, AlertTriangle, CalendarX } from 'lucide-react'

const CATEGORIES = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other']
const EMPTY = { name: '', category: 'Tablet', hsnCode: '', reorderThreshold: 10, sellingPrice: '' }

export default function InventoryTab({ medicines, batches, canWrite }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const toast = useToast()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const stock = useMemo(() => stockByMedicine(batches), [batches])
  const medById = useMemo(() => Object.fromEntries(medicines.map((m) => [m.id, m])), [medicines])

  // One row per batch, joined to its medicine master.
  const rows = useMemo(() => batches.map((b) => {
    const med = medById[b.medicineId] || {}
    const medStock = stock[b.medicineId] || 0
    return {
      id: b.id,
      name: med.name || b.medicineName || '—',
      hsnCode: med.hsnCode || '—',
      batchNumber: b.batchNumber || '—',
      expiryDate: b.expiryDate,
      quantity: Number(b.quantity) || 0,
      sellingPrice: b.sellingPrice ?? med.sellingPrice,
      lowStock: (Number(med.reorderThreshold) || 0) > 0 && medStock < Number(med.reorderThreshold),
      nearExpiry: isNearExpiry(b.expiryDate),
      expired: isExpired(b.expiryDate),
    }
  }).sort((a, b) => a.name.localeCompare(b.name)), [batches, medById, stock])

  const openAdd = () => { setForm(EMPTY); setModal('add') }
  const openEdit = (m) => {
    setForm({
      name: m.name || '', category: m.category || 'Tablet', hsnCode: m.hsnCode || '',
      reorderThreshold: m.reorderThreshold ?? 10, sellingPrice: m.sellingPrice ?? '', id: m.id,
    })
    setModal('edit')
  }
  const update = (f) => (e) => setForm({ ...form, [f]: e.target.value })

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Medicine name is required.'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(), category: form.category,
        hsnCode: form.hsnCode.trim() || null,
        reorderThreshold: Number(form.reorderThreshold) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
      }
      const opts = {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: modal === 'add' ? 'medicine_added' : 'medicine_updated', module: 'pharmacy' },
      }
      if (modal === 'add') await addDocument(`facilities/${facilityId}/pharmacy/medicines`, payload, opts)
      else await updateDocument(`facilities/${facilityId}/pharmacy/medicines/${form.id}`, payload, opts)
      setModal(null)
      toast.success('Saved.')
    } catch (err) {
      console.error(err); toast.error('Failed to save medicine.')
    } finally { setSaving(false) }
  }

  const columns = [
    { header: 'Medicine', accessor: 'name' },
    { header: 'HSN', cell: (r) => <span className="font-mono">{r.hsnCode}</span> },
    { header: 'Batch', cell: (r) => <span className="font-mono">{r.batchNumber}</span> },
    {
      header: 'Expiry',
      cell: (r) => {
        if (!r.expiryDate) return '—'
        if (r.expired) return <span className="badge badge-danger"><CalendarX size={11} /> Expired</span>
        if (r.nearExpiry) return <span className="badge badge-warning">{formatDate(r.expiryDate)}</span>
        return formatDate(r.expiryDate)
      },
    },
    {
      header: 'Stock',
      cell: (r) => r.lowStock
        ? <span className="badge badge-danger"><AlertTriangle size={11} /> {r.quantity}</span>
        : r.quantity,
    },
    { header: 'Unit Price', cell: (r) => formatINR(r.sellingPrice) },
  ]

  return (
    <div>
      <div className="pharmacy-alerts">
        {canWrite && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>
            <Plus size={16} /> Add Medicine
          </button>
        )}
      </div>

      {canWrite && medicines.length > 0 && (
        <div className="medicine-master-chips">
          {medicines.map((m) => (
            <button key={m.id} className="master-chip" onClick={() => openEdit(m)} title="Edit medicine master">
              <Edit size={11} /> {m.name}
            </button>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search medicine, batch, HSN…"
        emptyMessage="No stock batches yet. Add a medicine, then add stock in the Stock-in tab."
      />

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Add Medicine' : 'Edit Medicine'} size="md">
        <div className="form-row">
          <div className="form-group">
            <label>Name *</label>
            <input value={form.name} onChange={update('name')} placeholder="Medicine name" />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={update('category')}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>HSN Code</label>
            <input value={form.hsnCode} onChange={update('hsnCode')} placeholder="e.g. 3004" />
          </div>
          <div className="form-group">
            <label>Reorder Threshold</label>
            <input type="number" min="0" value={form.reorderThreshold} onChange={update('reorderThreshold')} />
          </div>
          <div className="form-group">
            <label>Default Selling Price (₹)</label>
            <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Medicine'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
