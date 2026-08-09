import { useState, useEffect, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import { registerOpdVisit, registrationErrorMessage } from '@lib/opd'
import {
  departmentsForFlow, doctorsInDepartment, departmentLocation,
} from '@lib/departments'
import Modal from '@components/Modal'
import { Calendar, Clock, User, Stethoscope, Network, MapPin } from 'lucide-react'

export default function QuickBookModal({ isOpen, onClose, prefill = {}, doctors = [] }) {
  const { facilityId } = useFacility()
  const [patients, setPatients] = useState([])
  const [departments, setDepartments] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    patientId: '',
    departmentId: '',
    doctorId: prefill.doctorId || '',
    date: prefill.date || new Date().toISOString().split('T')[0],
    // 'HH:MM'. Was an hour integer, which silently floored a 09:30 slot to
    // 09:00 and would have booked the patient into the wrong half of the hour.
    time: prefill.time
      || `${String(prefill.hour ?? 9).padStart(2, '0')}:${String(prefill.minute ?? 0).padStart(2, '0')}`,
    chiefComplaint: '',
  })

  useEffect(() => {
    if (!facilityId) return
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/patients`, setPatients),
      subscribeToCollection(`facilities/${facilityId}/departments`, setDepartments),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const opdDepartments = useMemo(() => departmentsForFlow(departments, 'opd'), [departments])
  const selectedDept = useMemo(
    () => departments.find((d) => d.id === form.departmentId) || null,
    [departments, form.departmentId]
  )
  const deptDoctors = useMemo(
    () => doctorsInDepartment(doctors, form.departmentId),
    [doctors, form.departmentId]
  )

  // A doctor prefilled from the calendar carries their department with them, so
  // the dropdown opens already narrowed instead of blank.
  useEffect(() => {
    if (!prefill.doctorId || form.departmentId) return
    const doc = doctors.find((d) => d.id === prefill.doctorId)
    if (doc?.departmentId) setForm((f) => ({ ...f, departmentId: doc.departmentId }))
  }, [prefill.doctorId, doctors, form.departmentId])

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  // Changing department invalidates any doctor picked from the previous one.
  const handleDepartmentChange = (e) => {
    setForm({ ...form, departmentId: e.target.value, doctorId: '' })
  }

  const handleBook = async () => {
    if (!form.patientId) { setError('Select a patient.'); return }
    if (!form.departmentId) { setError('Select a department.'); return }
    if (!form.doctorId) { setError('Select a doctor.'); return }

    setSaving(true)
    setError('')
    try {
      // Same server call the registration desk uses, so a quick booking and a
      // counter registration draw from one per-department token sequence and
      // neither can hand out a duplicate.
      await registerOpdVisit({
        patientId: form.patientId,
        departmentId: form.departmentId,
        doctorId: form.doctorId,
        visitDate: new Date(`${form.date}T${form.time}:00`).getTime(),
        chiefComplaint: form.chiefComplaint,
      })
      onClose()
    } catch (err) {
      console.error('Book appointment error:', err)
      setError(registrationErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Book Appointment" size="md">
      {error && <div className="auth-error">{error}</div>}

      <div className="form-group">
        <label><User size={14} /> Patient *</label>
        <select value={form.patientId} onChange={update('patientId')}>
          <option value="">Select patient...</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.uhid || p.phone}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label><Network size={14} /> Department *</label>
          <select value={form.departmentId} onChange={handleDepartmentChange}>
            <option value="">
              {opdDepartments.length ? 'Select department...' : 'No OPD departments configured'}
            </option>
            {opdDepartments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label><Stethoscope size={14} /> Doctor *</label>
          <select value={form.doctorId} onChange={update('doctorId')} disabled={!form.departmentId}>
            <option value="">
              {!form.departmentId
                ? 'Select a department first'
                : deptDoctors.length
                  ? 'Select doctor...'
                  : 'No doctors in this department'}
            </option>
            {deptDoctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedDept && (
        <div className="form-row">
          <div className="form-group">
            <label><MapPin size={14} /> Floor</label>
            <input value={departmentLocation(selectedDept) || '—'} readOnly disabled />
          </div>
          <div className="form-group">
            <label>Room No.</label>
            <input value={selectedDept.roomNumber || '—'} readOnly disabled />
          </div>
        </div>
      )}

      {opdDepartments.length === 0 && (
        <p className="settings-hint">
          Add departments under Administration → Facility Settings → Departments before booking.
        </p>
      )}

      <div className="form-row">
        <div className="form-group">
          <label><Calendar size={14} /> Date</label>
          <input type="date" value={form.date} onChange={update('date')} />
        </div>
        <div className="form-group">
          <label><Clock size={14} /> Time</label>
          <input type="time" value={form.time} onChange={update('time')} />
        </div>
      </div>

      <div className="form-group">
        <label>Chief Complaint</label>
        <input value={form.chiefComplaint} onChange={update('chiefComplaint')} placeholder="Brief reason for visit" />
      </div>

      <div className="form-actions">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleBook} disabled={saving}>
          {saving ? 'Booking...' : 'Book Appointment'}
        </button>
      </div>
    </Modal>
  )
}
