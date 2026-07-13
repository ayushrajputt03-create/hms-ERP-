import { useState, useEffect } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { addDocument, subscribeToCollection, incrementCounter } from '@lib/db'
import Modal from '@components/Modal'
import { Calendar, Clock, User, Stethoscope } from 'lucide-react'

export default function QuickBookModal({ isOpen, onClose, prefill = {}, doctors = [] }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [patients, setPatients] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    patientId: '',
    doctorId: prefill.doctorId || '',
    date: prefill.date || new Date().toISOString().split('T')[0],
    hour: prefill.hour || 9,
    chiefComplaint: '',
  })

  useEffect(() => {
    if (!facilityId) return
    return subscribeToCollection(`facilities/${facilityId}/patients`, setPatients)
  }, [facilityId])

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleBook = async () => {
    if (!form.patientId) { setError('Select a patient.'); return }
    if (!form.doctorId) { setError('Select a doctor.'); return }

    setSaving(true)
    setError('')
    try {
      const patient = patients.find((p) => p.id === form.patientId)
      const doctor = doctors.find((d) => d.id === form.doctorId)
      const visitDate = new Date(`${form.date}T${String(form.hour).padStart(2, '0')}:00:00`).getTime()
      const tokenNumber = await incrementCounter(`facilities/${facilityId}/counters/opdToken-${form.date}`)

      await addDocument(`facilities/${facilityId}/opdVisits`, {
        patientId: form.patientId,
        patientName: patient?.name || '',
        patientUhid: patient?.uhid || '',
        doctorId: form.doctorId,
        doctorName: doctor?.name || '',
        tokenNumber,
        status: 'booked',
        visitDate,
        chiefComplaint: form.chiefComplaint.trim() || null,
        facilityId,
      }, {
        user: staffProfile?.name || user?.email,
        facilityId,
        audit: { action: 'appointment_booked', module: 'opd' },
      })

      onClose()
    } catch (err) {
      console.error('Book appointment error:', err)
      setError('Failed to book appointment.')
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

      <div className="form-group">
        <label><Stethoscope size={14} /> Doctor *</label>
        <select value={form.doctorId} onChange={update('doctorId')}>
          <option value="">Select doctor...</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}{d.department ? ` — ${d.department}` : ''}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label><Calendar size={14} /> Date</label>
          <input type="date" value={form.date} onChange={update('date')} />
        </div>
        <div className="form-group">
          <label><Clock size={14} /> Time</label>
          <select value={form.hour} onChange={update('hour')}>
            {Array.from({ length: 12 }, (_, i) => i + 8).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
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
