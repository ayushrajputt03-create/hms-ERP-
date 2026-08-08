import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument, deleteDocument } from '@lib/db'
import { ROLES } from '@lib/constants'
import {
  DEPARTMENT_TYPES, DEPARTMENT_TYPE_LABELS, departmentLocation,
} from '@lib/departments'
import Modal from '@components/Modal'
import { useToast } from '@components/Toast'
import { Plus, Edit, Trash2, Building } from 'lucide-react'

const EMPTY = {
  name: '', code: '', floor: '', wing: '', roomNumber: '',
  hodDoctorId: '', departmentType: DEPARTMENT_TYPES.BOTH, status: 'active',
}

export default function DepartmentsManager() {
  const { facilityId } = useFacility()
  const { user, staffProfile } = useAuth()
  const toast = useToast()

  const [departments, setDepartments] = useState([])
  const [staff, setStaff] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!facilityId) return
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/departments`, setDepartments),
      subscribeToCollection(`facilities/${facilityId}/staff`, setStaff),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const doctors = useMemo(
    () => staff.filter((s) => s.role === ROLES.DOCTOR && s.status !== 'inactive'),
    [staff]
  )

  const doctorName = (id) => doctors.find((d) => d.id === id)?.name

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const openAdd = () => { setForm(EMPTY); setEditingId(null); setError(''); setModal(true) }

  const openEdit = (dept) => {
    setForm({
      name: dept.name || '', code: dept.code || '', floor: dept.floor || '',
      wing: dept.wing || '', roomNumber: dept.roomNumber || '',
      hodDoctorId: dept.hodDoctorId || '',
      departmentType: dept.departmentType || DEPARTMENT_TYPES.BOTH,
      status: dept.status || 'active',
    })
    setEditingId(dept.id)
    setError('')
    setModal(true)
  }

  const auditCtx = (action) => ({
    user: { uid: user?.uid, name: staffProfile?.name, role: staffProfile?.role },
    facilityId,
    audit: { action, module: 'admin', entityType: 'department' },
  })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Department name is required.'); return }
    const code = form.code.trim().toUpperCase()
    if (!code) { setError('Department code is required.'); return }

    const clash = departments.find((d) => d.id !== editingId && (d.code || '').toUpperCase() === code)
    if (clash) { setError(`Code "${code}" is already used by ${clash.name}.`); return }

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        code,
        floor: form.floor.trim() || null,
        wing: form.wing.trim() || null,
        roomNumber: form.roomNumber.trim() || null,
        hodDoctorId: form.hodDoctorId || null,
        departmentType: form.departmentType,
        status: form.status,
      }
      if (editingId) {
        await updateDocument(`facilities/${facilityId}/departments/${editingId}`, payload,
          auditCtx('department_updated'))
        toast.success('Department updated.')
      } else {
        await addDocument(`facilities/${facilityId}/departments`, payload,
          auditCtx('department_created'))
        toast.success('Department added.')
      }
      setModal(false)
    } catch (err) {
      console.error('Department save error:', err)
      setError('Failed to save department.')
    } finally {
      setSaving(false)
    }
  }

  // Deleting a department that doctors still point at would leave their profiles
  // dangling, so we require reassignment first and offer deactivation instead.
  const assignedDoctors = deleting
    ? doctors.filter((d) => d.departmentId === deleting.id)
    : []

  const handleDelete = async () => {
    if (assignedDoctors.length > 0) return
    setSaving(true)
    try {
      await deleteDocument(`facilities/${facilityId}/departments/${deleting.id}`,
        auditCtx('department_deleted'))
      toast.success('Department deleted.')
      setDeleting(null)
    } catch (err) {
      console.error('Department delete error:', err)
      toast.error('Failed to delete department.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-section">
      <div className="pharmacy-alerts">
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>
          <Plus size={16} /> Add Department
        </button>
      </div>

      {departments.length === 0 ? (
        <div className="empty-state">
          <Building size={20} /> No departments yet. Add one so OPD and IPD can route
          patients to the right floor and room.
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Location</th>
              <th>Room</th>
              <th>HOD</th>
              <th>Type</th>
              <th>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.name}</strong></td>
                <td className="font-mono">{d.code || '—'}</td>
                <td>{departmentLocation(d) || '—'}</td>
                <td>{d.roomNumber || '—'}</td>
                <td>{doctorName(d.hodDoctorId) ? `Dr. ${doctorName(d.hodDoctorId)}` : '—'}</td>
                <td>{DEPARTMENT_TYPE_LABELS[d.departmentType] || DEPARTMENT_TYPE_LABELS.both}</td>
                <td>
                  <span className={`badge badge-${d.status === 'inactive' ? 'muted' : 'success'}`}>
                    {d.status || 'active'}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button className="btn-icon" onClick={() => openEdit(d)}><Edit size={15} /></button>
                    <button className="btn-icon btn-danger" onClick={() => setDeleting(d)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        isOpen={!!modal}
        onClose={() => setModal(false)}
        title={editingId ? 'Edit Department' : 'Add Department'}
        size="md"
      >
        {error && <div className="auth-error">{error}</div>}

        <div className="form-row">
          <div className="form-group">
            <label>Department Name *</label>
            <input value={form.name} onChange={update('name')} placeholder="e.g. Cardiology" />
          </div>
          <div className="form-group">
            <label>Code *</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="e.g. CARDIO"
              maxLength={12}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Floor</label>
            <input value={form.floor} onChange={update('floor')} placeholder="e.g. 2nd Floor" />
          </div>
          <div className="form-group">
            <label>Wing</label>
            <input value={form.wing} onChange={update('wing')} placeholder="e.g. A Wing" />
          </div>
          <div className="form-group">
            <label>Room No.</label>
            <input value={form.roomNumber} onChange={update('roomNumber')} placeholder="e.g. Room 204" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Head of Department</label>
            <select value={form.hodDoctorId} onChange={update('hodDoctorId')}>
              <option value="">Not assigned</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Serves</label>
            <select value={form.departmentType} onChange={update('departmentType')}>
              {Object.entries(DEPARTMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={update('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <p className="settings-hint">
          Inactive departments stay on past visits and admissions but no longer appear
          in OPD or IPD dropdowns.
        </p>

        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update Department' : 'Add Department'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete Department" size="sm">
        {assignedDoctors.length > 0 ? (
          <>
            <p style={{ marginBottom: '1rem' }}>
              <strong>{deleting?.name}</strong> still has {assignedDoctors.length} doctor
              {assignedDoctors.length !== 1 ? 's' : ''} assigned
              ({assignedDoctors.map((d) => d.name).join(', ')}). Move them to another
              department first, or set this one to Inactive instead.
            </p>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setDeleting(null)}>Close</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginBottom: '1rem' }}>
              Delete <strong>{deleting?.name}</strong>? Past visits and admissions keep the
              department details already printed on them.
            </p>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setDeleting(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--danger)' }}
                onClick={handleDelete}
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
