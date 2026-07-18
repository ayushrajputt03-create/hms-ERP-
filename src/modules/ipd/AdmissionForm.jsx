import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument, getDocument } from '@lib/db'
import { ChevronLeft, BedDouble, Save } from 'lucide-react'

export default function AdmissionForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefillPatientId = params.get('patientId') || ''
  const sourceVisitId = params.get('visitId') || ''

  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [wards, setWards] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    patientId: prefillPatientId,
    doctorId: '',
    wardId: '',
    bedId: '',
    diagnosis: '',
    deposit: '',
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

  const selectedWard = wards.find((w) => w.id === form.wardId)
  const vacantBeds = selectedWard
    ? Object.entries(selectedWard.beds || {})
        .filter(([, b]) => b.status !== 'occupied')
        .map(([id, b]) => ({ id, ...b }))
    : []

  const handleAdmit = async () => {
    if (!form.patientId) { setError('Select a patient.'); return }
    if (!form.doctorId) { setError('Select a doctor.'); return }
    if (!form.wardId || !form.bedId) { setError('Select a ward and vacant bed.'); return }

    setSaving(true)
    setError('')
    try {
      const patient = patients.find((p) => p.id === form.patientId)
      const doctor = doctors.find((d) => d.id === form.doctorId)
      const bed = vacantBeds.find((b) => b.id === form.bedId)

      const admissionId = await addDocument(`facilities/${facilityId}/ipd/admissions`, {
        patientId: form.patientId,
        patientName: patient?.name || '',
        patientUhid: patient?.uhid || '',
        doctorId: form.doctorId,
        doctorName: doctor?.name || '',
        wardId: form.wardId,
        wardName: selectedWard?.name || '',
        bedId: form.bedId,
        bedName: bed?.name || '',
        ratePerDay: selectedWard?.ratePerDay || 0,
        diagnosis: form.diagnosis.trim() || null,
        deposit: Number(form.deposit) || 0,
        admissionDate: new Date(form.admissionDate).getTime(),
        sourceVisitId: sourceVisitId || null,
        status: 'admitted',
        facilityId,
      }, {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: 'patient_admitted', module: 'ipd' },
      })

      await updateDocument(`facilities/${facilityId}/ipd/wards/${form.wardId}/beds/${form.bedId}`, {
        status: 'occupied',
        admissionId,
      })

      if (Number(form.deposit) > 0) {
        await addDocument(`facilities/${facilityId}/billing`, {
          patientId: form.patientId,
          patientName: patient?.name || '',
          patientUhid: patient?.uhid || '',
          type: 'ipd_deposit',
          description: `IPD Admission Deposit — ${selectedWard?.name}/${bed?.name}`,
          amount: -Number(form.deposit),
          status: 'pending',
          admissionId,
          invoiceDate: Date.now(),
          facilityId,
        })
      }

      navigate(`/ipd/admission/${admissionId}`)
    } catch (err) {
      console.error('Admission error:', err)
      setError('Failed to admit patient. Please retry.')
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
                const vacant = Object.values(w.beds || {}).filter((b) => b.status !== 'occupied').length
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

        <div className="form-row">
          <div className="form-group">
            <label>Admission Date & Time</label>
            <input type="datetime-local" value={form.admissionDate} onChange={update('admissionDate')} />
          </div>
          <div className="form-group">
            <label>Deposit Amount (₹)</label>
            <input type="number" min="0" value={form.deposit} onChange={update('deposit')} placeholder="0" />
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
