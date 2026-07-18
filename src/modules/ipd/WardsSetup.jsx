import { useState } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { addDocument, updateDocument, deleteDocument } from '@lib/db'
import Modal from '@components/Modal'
import { Plus, Edit, Trash2 } from 'lucide-react'

const EMPTY = { name: '', ratePerDay: '', bedNames: '' }

export default function WardsSetup({ wards }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [deleteWard, setDeleteWard] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const openAdd = () => { setForm(EMPTY); setModal('add') }
  const openEdit = (ward) => {
    const bedNames = Object.values(ward.beds || {}).map((b) => b.name).join(', ')
    setForm({ name: ward.name || '', ratePerDay: ward.ratePerDay ?? '', bedNames, id: ward.id, existingBeds: ward.beds || {} })
    setModal('edit')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Ward name is required.'); return }
    const names = form.bedNames.split(',').map((s) => s.trim()).filter(Boolean)
    if (names.length === 0) { setError('Enter at least one bed name (comma separated).'); return }

    setSaving(true)
    setError('')
    try {
      const beds = {}
      names.forEach((name, i) => {
        const existing = form.existingBeds
          ? Object.entries(form.existingBeds).find(([, b]) => b.name === name)
          : null
        const bedId = existing ? existing[0] : `bed${i}-${Date.now().toString(36)}`
        beds[bedId] = existing
          ? existing[1]
          : { name, status: 'vacant', admissionId: null }
      })

      const payload = {
        name: form.name.trim(),
        ratePerDay: Number(form.ratePerDay) || 0,
        beds,
      }
      const auditOpts = {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: modal === 'add' ? 'ward_added' : 'ward_updated', module: 'ipd' },
      }
      if (modal === 'add') {
        await addDocument(`facilities/${facilityId}/ipd/wards`, payload, auditOpts)
      } else {
        await updateDocument(`facilities/${facilityId}/ipd/wards/${form.id}`, payload, auditOpts)
      }
      setModal(null)
    } catch (err) {
      console.error('Ward save error:', err)
      setError('Failed to save ward.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const hasOccupied = Object.values(deleteWard.beds || {}).some((b) => b.status === 'occupied')
    if (hasOccupied) {
      setError('Cannot delete a ward with occupied beds. Discharge or transfer patients first.')
      setDeleteWard(null)
      return
    }
    setSaving(true)
    try {
      await deleteDocument(`facilities/${facilityId}/ipd/wards/${deleteWard.id}`, {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: 'ward_deleted', module: 'ipd' },
      })
      setDeleteWard(null)
    } catch (err) {
      console.error('Ward delete error:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {error && <div className="auth-error">{error}</div>}
      <div className="pharmacy-alerts">
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>
          <Plus size={16} /> Add Ward
        </button>
      </div>

      {wards.length === 0 ? (
        <div className="empty-state">No wards yet. Add your first ward with beds.</div>
      ) : (
        <div className="queue-list">
          {wards.map((ward) => {
            const beds = Object.values(ward.beds || {})
            return (
              <div key={ward.id} className="queue-card">
                <div className="queue-patient-info">
                  <div className="queue-patient-name">{ward.name}</div>
                  <div className="queue-patient-meta">
                    {beds.length} bed{beds.length !== 1 ? 's' : ''} — ₹{ward.ratePerDay || 0}/day —{' '}
                    {beds.filter((b) => b.status === 'occupied').length} occupied
                  </div>
                  <div className="queue-doctor-name">{beds.map((b) => b.name).join(', ')}</div>
                </div>
                <div className="queue-actions">
                  <button className="btn btn-icon" onClick={() => openEdit(ward)}><Edit size={15} /></button>
                  <button className="btn btn-icon btn-danger" onClick={() => setDeleteWard(ward)}><Trash2 size={15} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Add Ward' : 'Edit Ward'} size="md">
        {error && <div className="auth-error">{error}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>Ward Name *</label>
            <input value={form.name} onChange={update('name')} placeholder="e.g. General Ward, ICU" />
          </div>
          <div className="form-group">
            <label>Bed Rate / Day (₹)</label>
            <input type="number" min="0" value={form.ratePerDay} onChange={update('ratePerDay')} />
          </div>
        </div>
        <div className="form-group">
          <label>Bed Names * (comma separated)</label>
          <textarea
            value={form.bedNames}
            onChange={update('bedNames')}
            placeholder="e.g. B1, B2, B3, B4"
            rows={2}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Ward'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!deleteWard} onClose={() => setDeleteWard(null)} title="Delete Ward" size="sm">
        <p style={{ marginBottom: '1rem' }}>
          Delete ward <strong>{deleteWard?.name}</strong> and all its beds? This cannot be undone.
        </p>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setDeleteWard(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={handleDelete} disabled={saving}>
            {saving ? 'Deleting...' : 'Yes, Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
