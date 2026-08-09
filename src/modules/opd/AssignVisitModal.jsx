import { useState, useMemo } from 'react'
import { X, Stethoscope, Network } from 'lucide-react'
import { departmentsForFlow, doctorsInDepartment, departmentLocation } from '@lib/departments'
import { assignErrorMessage } from '@lib/opd'

// Reception's triage step for a self-booked token: pick the department, then a
// doctor from within it. Deliberately mirrors the department/doctor pair on
// the counter registration form — same cascade, same location readout — so
// staff are not learning a second way to do the same thing.
export default function AssignVisitModal({ visit, departments, doctors, onAssign, onClose }) {
  const [departmentId, setDepartmentId] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const opdDepartments = useMemo(() => departmentsForFlow(departments, 'opd'), [departments])
  const selectedDept = useMemo(
    () => departments.find((d) => d.id === departmentId) || null,
    [departments, departmentId]
  )
  const deptDoctors = useMemo(
    () => doctorsInDepartment(doctors, departmentId),
    [doctors, departmentId]
  )

  // Changing department invalidates the doctor: the server rejects a doctor
  // from another department, so leaving a stale one selected would only
  // produce a confusing failure at submit time.
  const pickDepartment = (id) => {
    setDepartmentId(id)
    setDoctorId('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!departmentId || !doctorId) {
      setError('Select both a department and a doctor.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onAssign({ departmentId, doctorId })
    } catch (err) {
      setError(assignErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Assign Token {visit.tokenNumber ?? '—'}</h3>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="modal-body">
          {error && <div className="auth-error">{error}</div>}

          <p className="settings-hint">
            <strong>{visit.patientName || 'Unknown'}</strong>
            {visit.chiefComplaint ? ` — ${visit.chiefComplaint}` : ''}
          </p>

          <div className="form-group">
            <label><Network size={16} /> Department *</label>
            <select value={departmentId} onChange={(e) => pickDepartment(e.target.value)}>
              <option value="">
                {opdDepartments.length ? 'Select department…' : 'No OPD departments configured'}
              </option>
              {opdDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Shown before submit so the desk can tell the patient where to go
              without waiting for the slip to print. */}
          {selectedDept && (
            <p className="settings-hint">
              Floor: {departmentLocation(selectedDept) || 'Not assigned'}
              {'  |  '}
              Room: {selectedDept.roomNumber || 'Not assigned'}
            </p>
          )}

          <div className="form-group">
            <label><Stethoscope size={16} /> Doctor *</label>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={!departmentId}>
              <option value="">
                {!departmentId
                  ? 'Select a department first'
                  : deptDoctors.length ? 'Select doctor…' : 'No doctors in this department'}
              </option>
              {deptDoctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !departmentId || !doctorId}>
              {saving ? 'Assigning…' : 'Assign & Check In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
