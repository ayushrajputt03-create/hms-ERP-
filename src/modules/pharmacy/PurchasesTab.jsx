import { useState, useEffect } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument, adjustValue } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import DataTable from '@components/DataTable'
import Modal from '@components/Modal'
import { Plus } from 'lucide-react'

export default function PurchasesTab({ medicines, canWrite }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [purchases, setPurchases] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ medicineId: '', supplier: '', batchNumber: '', expiryDate: '', quantity: '', costPrice: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!facilityId) return
    return subscribeToCollection(`facilities/${facilityId}/pharmacy/purchases`, (data) => {
      setPurchases(data.sort((a, b) => (b.purchaseDate || 0) - (a.purchaseDate || 0)))
    })
  }, [facilityId])

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSave = async () => {
    if (!form.medicineId) { setError('Select a medicine.'); return }
    const qty = Number(form.quantity)
    if (!qty || qty <= 0) { setError('Enter a valid quantity.'); return }

    setSaving(true)
    setError('')
    try {
      const med = medicines.find((m) => m.id === form.medicineId)
      await adjustValue(`facilities/${facilityId}/pharmacy/medicines/${form.medicineId}/quantity`, qty)

      const updates = {}
      if (form.batchNumber.trim()) updates.batchNumber = form.batchNumber.trim()
      if (form.expiryDate) updates.expiryDate = form.expiryDate
      if (Object.keys(updates).length > 0) {
        await updateDocument(`facilities/${facilityId}/pharmacy/medicines/${form.medicineId}`, updates)
      }

      await addDocument(`facilities/${facilityId}/pharmacy/purchases`, {
        medicineId: form.medicineId,
        medicineName: med?.name || '',
        supplier: form.supplier.trim() || med?.supplier || null,
        batchNumber: form.batchNumber.trim() || null,
        expiryDate: form.expiryDate || null,
        quantity: qty,
        costPrice: Number(form.costPrice) || 0,
        totalCost: qty * (Number(form.costPrice) || 0),
        purchaseDate: Date.now(),
        enteredBy: staffProfile?.name || user?.email,
      }, {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: 'stock_purchased', module: 'pharmacy' },
      })

      setModal(false)
      setForm({ medicineId: '', supplier: '', batchNumber: '', expiryDate: '', quantity: '', costPrice: '' })
    } catch (err) {
      console.error('Purchase error:', err)
      setError('Failed to record purchase.')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { header: 'Date', cell: (p) => formatDate(p.purchaseDate, 'datetime') },
    { header: 'Medicine', accessor: 'medicineName' },
    { header: 'Batch', cell: (p) => <span className="font-mono">{p.batchNumber || '—'}</span> },
    { header: 'Qty Added', accessor: 'quantity' },
    { header: 'Cost/Unit', cell: (p) => formatINR(p.costPrice) },
    { header: 'Total', cell: (p) => formatINR(p.totalCost) },
    { header: 'Supplier', cell: (p) => p.supplier || '—' },
    { header: 'By', accessor: 'enteredBy' },
  ]

  return (
    <div>
      <div className="pharmacy-alerts">
        {canWrite && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal(true)}>
            <Plus size={16} /> Purchase Entry
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={purchases}
        searchPlaceholder="Search purchases..."
        emptyMessage="No purchase entries yet."
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Purchase Entry (Add Stock)" size="md">
        {error && <div className="auth-error">{error}</div>}
        <div className="form-group">
          <label>Medicine *</label>
          <select value={form.medicineId} onChange={update('medicineId')}>
            <option value="">Select medicine...</option>
            {medicines.map((m) => (
              <option key={m.id} value={m.id}>{m.name} (current stock: {m.quantity ?? 0})</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Quantity Added *</label>
            <input type="number" min="1" value={form.quantity} onChange={update('quantity')} />
          </div>
          <div className="form-group">
            <label>Cost Price / Unit (₹)</label>
            <input type="number" min="0" step="0.01" value={form.costPrice} onChange={update('costPrice')} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>New Batch Number</label>
            <input value={form.batchNumber} onChange={update('batchNumber')} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label>New Expiry Date</label>
            <input type="date" value={form.expiryDate} onChange={update('expiryDate')} />
          </div>
        </div>
        <div className="form-group">
          <label>Supplier</label>
          <input value={form.supplier} onChange={update('supplier')} placeholder="Supplier name" />
        </div>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Add Stock'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
