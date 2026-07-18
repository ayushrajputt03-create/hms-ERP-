import { useState } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { addDocument, updateDocument } from '@lib/db'
import { formatINR } from '@lib/utils'
import DataTable from '@components/DataTable'
import Modal from '@components/Modal'
import { Plus, Edit } from 'lucide-react'

const SAMPLE_TYPES = ['Blood', 'Urine', 'Stool', 'Sputum', 'Swab', 'Imaging', 'Other']
const CATEGORIES = ['Hematology', 'Biochemistry', 'Microbiology', 'Pathology', 'Radiology', 'Other']

const EMPTY = { name: '', category: 'Hematology', price: '', sampleType: 'Blood', normalRange: '' }

export default function CatalogTab({ tests, canWrite }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Test name is required.'); return }
    if (form.price === '' || isNaN(Number(form.price))) { setError('Enter a valid price.'); return }

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price),
        sampleType: form.sampleType,
        normalRange: form.normalRange.trim() || null,
      }
      const auditOpts = {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: modal === 'add' ? 'lab_test_added' : 'lab_test_updated', module: 'lab' },
      }
      if (modal === 'add') {
        await addDocument(`facilities/${facilityId}/lab/tests`, payload, auditOpts)
      } else {
        await updateDocument(`facilities/${facilityId}/lab/tests/${form.id}`, payload, auditOpts)
      }
      setModal(null)
    } catch (err) {
      console.error('Test save error:', err)
      setError('Failed to save test.')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { header: 'Test', accessor: 'name' },
    { header: 'Category', accessor: 'category' },
    { header: 'Sample', accessor: 'sampleType' },
    { header: 'Normal Range', cell: (t) => t.normalRange || '—' },
    { header: 'Price', cell: (t) => formatINR(t.price) },
    ...(canWrite ? [{
      header: '',
      cell: (t) => (
        <button className="btn btn-icon" onClick={(e) => {
          e.stopPropagation()
          setForm({ ...EMPTY, ...t })
          setModal('edit')
        }}><Edit size={15} /></button>
      ),
    }] : []),
  ]

  return (
    <div>
      {canWrite && (
        <div className="pharmacy-alerts">
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setForm(EMPTY); setModal('add') }}>
            <Plus size={16} /> Add Test
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={tests}
        searchPlaceholder="Search tests..."
        emptyMessage="No tests in catalog. Add tests to start ordering."
      />

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Add Test' : 'Edit Test'} size="md">
        {error && <div className="auth-error">{error}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>Test Name *</label>
            <input value={form.name} onChange={update('name')} placeholder="e.g. CBC, Lipid Profile" />
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
            <label>Price (₹) *</label>
            <input type="number" min="0" value={form.price} onChange={update('price')} />
          </div>
          <div className="form-group">
            <label>Sample Type</label>
            <select value={form.sampleType} onChange={update('sampleType')}>
              {SAMPLE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Normal Range / Reference</label>
          <input value={form.normalRange} onChange={update('normalRange')} placeholder="e.g. 4.0-11.0 x10³/µL" />
        </div>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Test'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
