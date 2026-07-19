import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, getDocument } from '@lib/db'
import { admitPatient } from '@lib/ipd'
import { ChevronLeft, BedDouble, Save } from 'lucide-react'

export default function AdmissionForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefillPatientId = params.get('patientId') || ''
  const sourceVisitId = params.get('visitId') || ''
  const prefillWardId = params.get('wardId') || ''
  const prefillBedId = params.get('bedId') || ''

  const { facilityId } = useFacility()
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [wards, setWards] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    patientId: prefillPatientId,
    doctorId: '',
    wardId: prefillWardId,
    bedId: prefillBedId,
    diagnosis: '',
    admissionDate: new Date().toISOString().slice(0, 16),
  })

  useEffect(() => {
    if (!facilityId) return
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/patients`, (data) => {
        setPatients(data.filter((p) => p.status !== 'archived'))
      }),
      subscribeToCollection(`facilities/${facilityId}/staff`, (data) => {
        setDoctors(data.filter((s) => s.role === 'doctor' && s.status === 'active'))
      }),
      subscribeToCollection(`facilities/${facilityId}/ipd/wards`, setWards),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  useEffect(() => {
    if (!sourceVisitId || !facilityId) return
    getDocument(`facilities/${facilityId}/opdVisits/${sourceVisitId}`).then((v) => {
      if (v?.diagnosis) setForm((f) => ({ ...f, diagnosis: v.diagnosis, doctorId: v.doctorId || f.doctorId }))
    })
  }, [sourceVisitId, facilityId])

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const isAvailable = (b) => !b.status || b.status === 'vacant'
  const selectedWard = wards.find((w) => w.id === form.wardId)
  const vacantBeds = selectedWard
    ? Object.entries(selectedWard.beds || {})
        .filter(([, b]) => isAvailable(b))
        .map(([id, b]) => ({ id, ...b }))
    : []

  const handleAdmit = async () => {
    if (!form.patientId) { setError('Select a patient.'); return }
    if (!form.doctorId) { setError('Select a doctor.'); return }
    if (!form.wardId || !form.bedId) { setError('Select a ward and vacant bed.'); return }

    setSaving(true)
    setError('')
    try {
      // Atomic RPC: locks the ward, rejects an already-taken bed, creates the
      // admission and flips the bed — no client-side double-booking window.
      const admissionId = await admitPatient({
        patientId: form.patientId,
        doctorId: form.doctorId,
        wardId: form.wardId,
        bedId: form.bedId,
        diagnosis: form.diagnosis.trim() || null,
      })
      navigate(`/ipd/admission/${admissionId}`)
    } catch (err) {
      console.error('Admission error:', err)
      if (/not available/i.test(err.message || '')) {
        setError('That bed was just taken by someone else. Please pick another bed.')
      } else {
        setError(err.message || 'Failed to admit patient. Please retry.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>
          <button className="btn btn-icon" onClick={() => navigate('/ipd')}><ChevronLeft size={20} /></button>
          <BedDouble size={22} /> New IPD Admission
        </h2>
      </div>

      <div className="patient-form-card" style={{ maxWidth: 640 }}>
        {error && <div className="auth-error">{error}</div>}

        <div className="form-group">
          <label>Patient *</label>
          <select value={form.patientId} onChange={update('patientId')}>
            <option value="">Select patient...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.uhid || p.phone}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Attending Doctor *</label>
          <select value={form.doctorId} onChange={update('doctorId')}>
            <option value="">Select doctor...</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.department ? ` — ${d.department}` : ''}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Ward *</label>
            <select value={form.wardId} onChange={(e) => setForm({ ...form, wardId: e.target.value, bedId: '' })}>
              <option value="">Select ward...</option>
              {wards.map((w) => {
                const vacant = Object.values(w.beds || {}).filter(isAvailable).length
                return (
                  <option key={w.id} value={w.id} disabled={vacant === 0}>
                    {w.name} ({vacant} vacant) — ₹{w.ratePerDay || 0}/day
                  </option>
                )
              })}
            </select>
          </div>
          <div className="form-group">
            <label>Bed * (vacant only)</label>
            <select value={form.bedId} onChange={update('bedId')} disabled={!form.wardId}>
              <option value="">Select bed...</option>
              {vacantBeds.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Admission Diagnosis</label>
          <textarea value={form.diagnosis} onChange={update('diagnosis')} rows={2} placeholder="Reason for admission" />
        </div>

        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => navigate('/ipd')}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdmit} disabled={saving}>
            {saving ? 'Admitting...' : <><Save size={14} /> Admit Patient</>}
          </button>
        </div>
      </div>
    </div>
  )
}
