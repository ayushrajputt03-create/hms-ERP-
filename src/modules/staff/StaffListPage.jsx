import { useState } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { useFirestoreCollection } from '@hooks/useFirestoreCollection'
import { addDocument, updateDocument, deleteDocument } from '@lib/db'
import { ROLE_LABELS, ROLES } from '@lib/constants'
import { isActive as isDeptActive, departmentLocation } from '@lib/departments'
import DataTable from '@components/DataTable'
import Modal from '@components/Modal'
import { useToast } from '@components/Toast'
import { UserPlus, Edit, Trash2 } from 'lucide-react'

export default function StaffListPage() {
  const { facilityId } = useFacility()
  const { staffProfile, user } = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const { data: staffList, loading } = useFirestoreCollection(
    facilityId ? `facilities/${facilityId}/staff` : null
  )

  const { data: departments } = useFirestoreCollection(
    facilityId ? `facilities/${facilityId}/departments` : null
  )

  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: 'receptionist', departmentId: '', status: 'active',
    registrationNumber: '', qualification: '',
  })

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', role: 'receptionist', departmentId: '', status: 'active', registrationNumber: '', qualification: '' })
    setEditing(null)
    setShowForm(false)
  }

  const deptById = (id) => (departments || []).find((d) => d.id === id) || null
  const selectedDept = deptById(form.departmentId)

  const handleSave = async () => {
    if (!form.name || !form.email || !form.role) {
      toast.error('Name, email, and role are required.')
      return
    }
    if (form.role === ROLES.DOCTOR && !form.departmentId) {
      toast.error('Assign the doctor to a department.')
      return
    }

    // `department` is the denormalised name so lists and older records that read
    // it keep rendering; `departmentId` is the link the dropdowns filter on.
    const payload = {
      ...form,
      departmentId: form.departmentId || null,
      department: selectedDept?.name || '',
    }

    const auditCtx = {
      user: { uid: user.uid, name: staffProfile.name, role: staffProfile.role },
      facilityId,
    }

    try {
      if (editing) {
        await updateDocument(`facilities/${facilityId}/staff/${editing.id}`, payload, {
          ...auditCtx,
          audit: { action: 'update', module: 'staff', entityType: 'staff', entityId: editing.id, description: `Updated staff: ${form.name}` },
        })
        toast.success('Staff updated.')
      } else {
        await addDocument(`facilities/${facilityId}/staff`, payload, {
          ...auditCtx,
          audit: { action: 'create', module: 'staff', entityType: 'staff', description: `Added staff: ${form.name}` },
        })
        toast.success('Staff member added.')
      }
      resetForm()
    } catch (err) {
      toast.error('Failed to save staff member.')
      console.error(err)
    }
  }

  const handleEdit = (staff) => {
    setForm({
      name: staff.name || '',
      email: staff.email || '',
      phone: staff.phone || '',
      role: staff.role || 'receptionist',
      departmentId: staff.departmentId || '',
      status: staff.status || 'active',
      registrationNumber: staff.registrationNumber || '',
      qualification: staff.qualification || '',
    })
    setEditing(staff)
    setShowForm(true)
  }

  const handleDelete = async (staff) => {
    if (!confirm(`Remove ${staff.name}?`)) return
    try {
      await deleteDocument(`facilities/${facilityId}/staff/${staff.id}`, {
        user: { uid: user.uid, name: staffProfile.name, role: staffProfile.role },
        facilityId,
        audit: { action: 'delete', module: 'staff', entityType: 'staff', entityId: staff.id, description: `Removed staff: ${staff.name}` },
      })
      toast.success('Staff member removed.')
    } catch (err) {
      toast.error('Failed to remove staff member.')
    }
  }

  const isAdmin = staffProfile?.role === ROLES.FACILITY_ADMIN || staffProfile?.role === ROLES.SUPER_ADMIN

  const columns = [
    { header: 'Name', accessor: 'name' },
    { header: 'Email', accessor: 'email' },
    { header: 'Phone', accessor: 'phone' },
    { header: 'Role', accessor: 'role', cell: (r) => ROLE_LABELS[r.role] || r.role },
    { header: 'Department', accessor: 'department', cell: (r) => {
      const dept = deptById(r.departmentId)
      return dept?.name || r.department || '—'
    }},
    { header: 'Location', cell: (r) => {
      const dept = deptById(r.departmentId)
      if (!dept) return '—'
      return [departmentLocation(dept), dept.roomNumber].filter(Boolean).join(' • ') || '—'
    }},
    { header: 'Status', accessor: 'status', cell: (r) => (
      <span className={`badge badge-${r.status === 'active' ? 'success' : 'muted'}`}>
        {r.status}
      </span>
    )},
    ...(isAdmin ? [{
      header: 'Actions',
      cell: (r) => (
        <div className="table-actions">
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleEdit(r) }}>
            <Edit size={16} />
          </button>
          <button className="btn-icon btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>
            <Trash2 size={16} />
          </button>
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="staff-page">
      <div className="page-header">
        <h2>Staff Management</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <UserPlus size={16} /> Add Staff
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={staffList}
        searchPlaceholder="Search staff..."
        emptyMessage="No staff members added yet."
      />

      <Modal isOpen={showForm} onClose={resetForm} title={editing ? 'Edit Staff' : 'Add Staff'}>
        <div className="setup-form">
          <div className="form-group">
            <label>Full Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'super_admin').map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Department {form.role === ROLES.DOCTOR && '*'}</label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              >
                <option value="">
                  {(departments || []).length ? 'Select department...' : 'No departments configured'}
                </option>
                {(departments || []).filter(isDeptActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {selectedDept && (
                <span className="settings-hint">
                  {[departmentLocation(selectedDept), selectedDept.roomNumber]
                    .filter(Boolean).join(' • ') || 'No location set for this department'}
                </span>
              )}
              {(departments || []).length === 0 && (
                <span className="settings-hint">
                  Add departments under Administration → Facility Settings → Departments.
                </span>
              )}
            </div>
          </div>
          {form.role === 'doctor' && (
            <div className="form-row">
              <div className="form-group">
                <label>Medical Registration No.</label>
                <input
                  value={form.registrationNumber}
                  onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                  placeholder="e.g. UPMC/12345"
                />
              </div>
              <div className="form-group">
                <label>Qualification</label>
                <input
                  value={form.qualification}
                  onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                  placeholder="e.g. MBBS, MD (Medicine)"
                />
              </div>
            </div>
          )}
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={resetForm}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editing ? 'Update' : 'Add'} Staff
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
