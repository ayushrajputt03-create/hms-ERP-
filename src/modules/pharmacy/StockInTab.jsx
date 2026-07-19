import { useState, useEffect } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { addDocument, subscribeToCollection } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import DataTable from '@components/DataTable'
import Modal from '@components/Modal'
import { useToast } from '@components/Toast'
import { PackagePlus } from 'lucide-react'

const EMPTY = {
  medicineId: '', newMedicineName: '', batchNumber: '', expiryDate: '',
  quantity: '', purchasePrice: '', sellingPrice: '', supplier: '',
}

export default function StockInTab({ medicines }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const toast = useToast()
  const [batches, setBatches] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!facilityId) return
    return subscribeToCollection(`facilities/${facilityId}/pharmacy/batches`, (d) =>
      setBatches(d.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0))))
  }, [facilityId])

  const update = (f) => (e) => setForm({ ...form, [f]: e.target.value })

  const handleSave = async () => {
    const qty = Number(form.quantity)
    if (!form.medicineId && !form.newMedicineName.trim()) { toast.error('Select or name a medicine.'); return }
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity.'); return }
    if (!form.batchNumber.trim()) { toast.error('Batch number is required.'); return }

    setSaving(true)
    try {
      let medicineId = form.medicineId
      let medicineName = medicines.find((m) => m.id === medicineId)?.name

      // Create the medicine master on the fly if a new name was typed.
      if (!medicineId && form.newMedicineName.trim()) {
        medicineName = form.newMedicineName.trim()
        medicineId = await addDocument(`facilities/${facilityId}/pharmacy/medicines`, {
          name: medicineName, category: 'Other', reorderThreshold: 10,
          sellingPrice: Number(form.sellingPrice) || 0,
        }, { user: staffProfile?.name || user?.email, facilityId, audit: { action: 'medicine_added', module: 'pharmacy' } })
      }

      await addDocument(`facilities/${facilityId}/pharmacy/batches`, {
        medicineId,
        medicineName,
        batchNumber: form.batchNumber.trim(),
        expiryDate: form.expiryDate || null,
        quantity: qty,
        purchasePrice: Number(form.purchasePrice) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        supplier: form.supplier.trim() || null,
        receivedAt: Date.now(),
      }, {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: 'stock_received', module: 'pharmacy' },
      })

      setModal(false); setForm(EMPTY)
      toast.success('Stock added.')
    } catch (err) {
      console.error(err); toast.error('Failed to add stock.')
    } finally { setSaving(false) }
  }

  const columns = [
    { header: 'Received', cell: (b) => formatDate(b.receivedAt, 'datetime') },
    { header: 'Medicine', accessor: 'medicineName' },
    { header: 'Batch', cell: (b) => <span className="font-mono">{b.batchNumber}</span> },
    { header: 'Expiry', cell: (b) => b.expiryDate ? formatDate(b.expiryDate) : '—' },
    { header: 'Qty', accessor: 'quantity' },
    { header: 'Cost', cell: (b) => formatINR(b.purchasePrice) },
    { header: 'Selling', cell: (b) => formatINR(b.sellingPrice) },
  ]

  return (
    <div>
      <div className="pharmacy-alerts">
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal(true)}>
          <PackagePlus size={16} /> Add Stock (Batch)
        </button>
      </div>

      <DataTable columns={columns} data={batches} searchPlaceholder="Search batches…" emptyMessage="No stock received yet." />

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Add Stock — New Batch" size="md">
        <div className="form-group">
          <label>Existing Medicine</label>
          <select value={form.medicineId} onChange={(e) => setForm({ ...form, medicineId: e.target.value, newMedicineName: '' })}>
            <option value="">— or create new below —</option>
            {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {!form.medicineId && (
          <div className="form-group">
            <label>New Medicine Name</label>
            <input value={form.newMedicineName} onChange={update('newMedicineName')} placeholder="Create a new medicine" />
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Batch Number *</label>
            <input value={form.batchNumber} onChange={update('batchNumber')} placeholder="e.g. B1234" />
          </div>
          <div className="form-group">
            <label>Expiry Date</label>
            <input type="date" value={form.expiryDate} onChange={update('expiryDate')} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Quantity Received *</label>
            <input type="number" min="1" value={form.quantity} onChange={update('quantity')} />
          </div>
          <div className="form-group">
            <label>Purchase Price (₹)</label>
            <input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={update('purchasePrice')} />
          </div>
          <div className="form-group">
            <label>Selling Price (₹)</label>
            <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} />
          </div>
        </div>
        <div className="form-group">
          <label>Supplier</label>
          <input value={form.supplier} onChange={update('supplier')} placeholder="Supplier name" />
        </div>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add Stock'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
