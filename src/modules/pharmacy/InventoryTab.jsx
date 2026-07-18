import { useState } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { addDocument, updateDocument } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import DataTable from '@components/DataTable'
import Modal from '@components/Modal'
import { Plus, Edit, AlertTriangle, CalendarX } from 'lucide-react'

const LOW_STOCK_DEFAULT = 10
const EXPIRY_WINDOW_DAYS = 30
const CATEGORIES = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other']

const EMPTY_FORM = {
  name: '', category: 'Tablet', batchNumber: '', expiryDate: '',
  quantity: '', unitPrice: '', supplier: '', lowStockThreshold: LOW_STOCK_DEFAULT,
}

export default function InventoryTab({ medicines, canWrite }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setForm(EMPTY_FORM); setModal('add') }
  const openEdit = (med) => {
    setForm({
      name: med.name || '', category: med.category || 'Tablet',
      batchNumber: med.batchNumber || '', expiryDate: med.expiryDate || '',
      quantity: med.quantity ?? '', unitPrice: med.unitPrice ?? '',
      supplier: med.supplier || '', lowStockThreshold: med.lowStockThreshold ?? LOW_STOCK_DEFAULT,
      id: med.id,
    })
    setModal('edit')
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Medicine name is required.'); return }
    if (form.quantity === '' || isNaN(Number(form.quantity)) || Number(form.quantity) < 0) {
      setError('Enter a valid quantity.'); return
    }
    if (form.unitPrice === '' || isNaN(Number(form.unitPrice)) || Number(form.unitPrice) < 0) {
      setError('Enter a valid unit price.'); return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        batchNumber: form.batchNumber.trim() || null,
        expiryDate: form.expiryDate || null,
        quantity: Number(form.quantity),
        unitPrice: Number(form.unitPrice),
        supplier: form.supplier.trim() || null,
        lowStockThreshold: Number(form.lowStockThreshold) || LOW_STOCK_DEFAULT,
      }
      const auditOpts = {
        user: staffProfile?.name || user?.email,
        facilityId,
        audit: { action: modal === 'add' ? 'medicine_added' : 'medicine_updated', module: 'pharmacy' },
      }
      if (modal === 'add') {
        await addDocument(`facilities/${facilityId}/pharmacy/medicines`, payload, auditOpts)
      } else {
        await updateDocument(`facilities/${facilityId}/pharmacy/medicines/${form.id}`, payload, auditOpts)
      }
      setModal(null)
    } catch (err) {
      console.error('Medicine save error:', err)
      setError('Failed to save medicine.')
    } finally {
      setSaving(false)
    }
  }

  const isLowStock = (m) => (m.quantity ?? 0) < (m.lowStockThreshold ?? LOW_STOCK_DEFAULT)
  const isExpiringSoon = (m) => {
    if (!m.expiryDate) return false
    const days = (new Date(m.expiryDate) - new Date()) / 86400000
    return days >= 0 && days <= EXPIRY_WINDOW_DAYS
  }
  const isExpired = (m) => m.expiryDate && new Date(m.expiryDate) < new Date()

  const lowStockCount = medicines.filter(isLowStock).length
  const expiringCount = medicines.filter(isExpiringSoon).length

  const columns = [
    { header: 'Medicine', accessor: 'name' },
    { header: 'Category', accessor: 'category' },
    { header: 'Batch', cell: (m) => <span className="font-mono">{m.batchNumber || '—'}</span> },
    {
      header: 'Expiry',
      cell: (m) => {
        if (!m.expiryDate) return '—'
        if (isExpired(m)) return <span className="badge badge-danger"><CalendarX size={11} /> Expired</span>
        if (isExpiringSoon(m)) return <span className="badge badge-warning">{formatDate(m.expiryDate)}</span>
        return formatDate(m.expiryDate)
      },
    },
    {
      header: 'Stock',
      cell: (m) => isLowStock(m)
        ? <span className="badge badge-danger"><AlertTriangle size={11} /> {m.quantity ?? 0}</span>
        : (m.quantity ?? 0),
    },
    { header: 'Unit Price', cell: (m) => formatINR(m.unitPrice) },
    { header: 'Supplier', cell: (m) => m.supplier || '—' },
    ...(canWrite ? [{
      header: '',
      cell: (m) => (
        <button className="btn btn-icon" onClick={(e) => { e.stopPropagation(); openEdit(m) }} title="Edit">
          <Edit size={15} />
        </button>
      ),
    }] : []),
  ]

  return (
    <div>
      <div className="pharmacy-alerts">
        {lowStockCount > 0 && (
          <span className="badge badge-danger"><AlertTriangle size={12} /> {lowStockCount} low stock</span>
        )}
        {expiringCount > 0 && (
          <span className="badge badge-warning"><CalendarX size={12} /> {expiringCount} expiring within 30 days</span>
        )}
        {canWrite && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>
            <Plus size={16} /> Add Medicine
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={medicines}
        searchPlaceholder="Search medicine, batch, supplier..."
        emptyMessage="No medicines in inventory. Add your first medicine."
      />

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Add Medicine' : 'Edit Medicine'} size="md">
        {error && <div className="auth-error">{error}</div>}
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
            <label>Batch Number</label>
            <input value={form.batchNumber} onChange={update('batchNumber')} placeholder="Batch" />
          </div>
          <div className="form-group">
            <label>Expiry Date</label>
            <input type="date" value={form.expiryDate} onChange={update('expiryDate')} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Quantity *</label>
            <input type="number" min="0" value={form.quantity} onChange={update('quantity')} placeholder="0" />
          </div>
          <div className="form-group">
            <label>Unit Price (₹) *</label>
            <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={update('unitPrice')} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label>Low Stock Alert At</label>
            <input type="number" min="0" value={form.lowStockThreshold} onChange={update('lowStockThreshold')} />
          </div>
        </div>
        <div className="form-group">
          <label>Supplier</label>
          <input value={form.supplier} onChange={update('supplier')} placeholder="Supplier name" />
        </div>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Medicine'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
