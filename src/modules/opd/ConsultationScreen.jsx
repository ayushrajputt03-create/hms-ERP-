import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { getDocument, updateDocument, addDocument, queryDocuments } from '@lib/db'
import { formatDate, calculateAge } from '@lib/utils'
import PrescriptionBuilder from './PrescriptionBuilder'
import {
  ChevronLeft, AlertTriangle, Heart, Thermometer, Activity,
  Droplets, Wind, Save, CheckCircle, FileText, Clock,
} from 'lucide-react'

export default function ConsultationScreen() {
  const { visitId } = useParams()
  const navigate = useNavigate()
  const { user, staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()

  const [visit, setVisit] = useState(null)
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const [vitals, setVitals] = useState({ bp: '', temp: '', pulse: '', spo2: '', weight: '', height: '' })
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [prescription, setPrescription] = useState([])
  const [followUpDate, setFollowUpDate] = useState('')

  const bmi = (() => {
    const w = parseFloat(vitals.weight)
    const h = parseFloat(vitals.height)
    if (!w || !h) return null
    return (w / ((h / 100) ** 2)).toFixed(1)
  })()

  const [history, setHistory] = useState([])

  useEffect(() => {
    if (!facilityId || !visitId) return
    loadVisit()
  }, [facilityId, visitId])

  const loadVisit = async () => {
    const v = await getDocument(`facilities/${facilityId}/opdVisits/${visitId}`)
    if (!v) { setLoading(false); return }
    setVisit(v)
    setChiefComplaint(v.chiefComplaint || '')
    setDiagnosis(v.diagnosis || '')
    setNotes(v.notes || '')
    setPrescription(v.prescription || [])
    setFollowUpDate(v.followUpDate || '')
    if (v.vitals) setVitals({ weight: '', height: '', ...v.vitals })

    if (v.patientId) {
      const p = await getDocument(`facilities/${facilityId}/patients/${v.patientId}`)
      setPatient(p)

      const allVisits = await queryDocuments(`facilities/${facilityId}/opdVisits`, {
        orderBy: 'patientId', equalTo: v.patientId,
      })
      setHistory(allVisits.filter((hv) => hv.id !== visitId).sort((a, b) => (b.visitDate || b.createdAt || 0) - (a.visitDate || a.createdAt || 0)).slice(0, 10))
    }
    setLoading(false)
  }

  const updateVital = (field) => (e) => setVitals({ ...vitals, [field]: e.target.value })

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateDocument(`facilities/${facilityId}/opdVisits/${visitId}`, {
        vitals: { ...vitals, bmi },
        chiefComplaint: chiefComplaint.trim(),
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        prescription,
        followUpDate: followUpDate || null,
        status: 'in_progress',
      }, {
        user: staffProfile?.name || user?.email,
        facilityId,
        audit: { action: 'consultation_saved', module: 'opd' },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save consultation.')
    } finally {
      setSaving(false)
    }
  }

  const handleEndVisit = async () => {
    setSaving(true)
    setError('')
    try {
      await updateDocument(`facilities/${facilityId}/opdVisits/${visitId}`, {
        vitals: { ...vitals, bmi },
        chiefComplaint: chiefComplaint.trim(),
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        prescription,
        followUpDate: followUpDate || null,
        status: 'completed',
        completedAt: Date.now(),
      }, {
        user: staffProfile?.name || user?.email,
        facilityId,
        audit: { action: 'consultation_completed', module: 'opd' },
      })

      const tariffs = await queryDocuments(`facilities/${facilityId}/tariffMaster`)
      const consultTariff = tariffs.find((t) => t.category === 'consultation' && t.status === 'active')
      const amount = consultTariff?.amount || 500

      await addDocument(`facilities/${facilityId}/billing`, {
        patientId: visit.patientId,
        patientName: visit.patientName || patient?.name || '',
        patientUhid: visit.patientUhid || patient?.uhid || '',
        type: 'opd_consultation',
        description: `OPD Consultation — Dr. ${visit.doctorName || ''}`,
        amount,
        status: 'pending',
        visitId,
        doctorId: visit.doctorId,
        invoiceDate: Date.now(),
        facilityId,
      }, {
        user: staffProfile?.name || user?.email,
        facilityId,
        audit: { action: 'billing_line_created', module: 'billing' },
      })

      if (patient) {
        await updateDocument(`facilities/${facilityId}/patients/${visit.patientId}`, {
          lastVisitDate: Date.now(),
        })
      }

      navigate('/opd/queue')
    } catch (err) {
      console.error('End visit error:', err)
      setError('Failed to end visit.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty-state">Loading consultation...</div>
  if (!visit) return <div className="empty-state">Visit not found.</div>

  const isCompleted = visit.status === 'completed'

  return (
    <div className="consultation-page">
      <div className="page-header">
        <button className="btn btn-outline" onClick={() => navigate('/opd/queue')}>
          <ChevronLeft size={16} /> Back to Queue
        </button>
        <div className="consultation-actions">
          {!isCompleted && (
            <>
              <button className="btn btn-outline" onClick={handleSave} disabled={saving}>
                <Save size={14} /> {saved ? 'Saved!' : 'Save'}
              </button>
              <button className="btn btn-primary" onClick={handleEndVisit} disabled={saving}>
                <CheckCircle size={14} /> End Visit & Bill
              </button>
            </>
          )}
          {isCompleted && <span className="badge badge-success">Completed</span>}
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {patient?.allergies?.length > 0 && (
        <div className="allergy-banner">
          <AlertTriangle size={16} />
          <strong>ALLERGIES:</strong>
          {patient.allergies.map((a, i) => <span key={i} className="allergy-tag">{a}</span>)}
        </div>
      )}

      <div className="consultation-header-bar">
        <div>
          <strong>{patient?.name || visit.patientName}</strong>
          <span className="font-mono"> {patient?.uhid || visit.patientUhid}</span>
          {patient?.dob && <span> — {calculateAge(patient.dob)}Y / {patient.gender?.charAt(0).toUpperCase()}</span>}
        </div>
        <div>
          <span>Token #{visit.tokenNumber}</span>
          <span> — Dr. {visit.doctorName}</span>
          <span> — {formatDate(visit.visitDate || visit.createdAt, 'datetime')}</span>
        </div>
      </div>

      <div className="consultation-layout">
        <div className="consultation-left">
          <fieldset className="form-fieldset">
            <legend><Thermometer size={14} /> Vitals</legend>
            <div className="vitals-grid">
              <div className="form-group">
                <label><Activity size={12} /> BP (mmHg)</label>
                <input value={vitals.bp} onChange={updateVital('bp')} placeholder="120/80" disabled={isCompleted} />
              </div>
              <div className="form-group">
                <label><Thermometer size={12} /> Temp (°F)</label>
                <input value={vitals.temp} onChange={updateVital('temp')} placeholder="98.6" disabled={isCompleted} />
              </div>
              <div className="form-group">
                <label><Heart size={12} /> Pulse (bpm)</label>
                <input value={vitals.pulse} onChange={updateVital('pulse')} placeholder="72" disabled={isCompleted} />
              </div>
              <div className="form-group">
                <label><Droplets size={12} /> SpO2 (%)</label>
                <input value={vitals.spo2} onChange={updateVital('spo2')} placeholder="98" disabled={isCompleted} />
              </div>
              <div className="form-group">
                <label>Weight (kg)</label>
                <input value={vitals.weight} onChange={updateVital('weight')} placeholder="70" disabled={isCompleted} />
              </div>
              <div className="form-group">
                <label>Height (cm)</label>
                <input value={vitals.height} onChange={updateVital('height')} placeholder="170" disabled={isCompleted} />
              </div>
            </div>
            {bmi && (
              <div className="bmi-display">
                BMI: <strong>{bmi}</strong>
                <span className={`badge ${bmi < 18.5 ? 'badge-warning' : bmi < 25 ? 'badge-success' : bmi < 30 ? 'badge-warning' : 'badge-danger'}`}>
                  {bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}
                </span>
              </div>
            )}
          </fieldset>

          <div className="consultation-history">
            <h4><Clock size={14} /> Past Visits ({history.length})</h4>
            {history.length === 0 ? (
              <p className="text-muted">No previous visits.</p>
            ) : (
              history.map((hv) => (
                <div key={hv.id} className="history-item">
                  <span className="history-date">{formatDate(hv.visitDate || hv.createdAt)}</span>
                  <span>{hv.chiefComplaint || '—'}</span>
                  {hv.diagnosis && <span className="history-dx">Dx: {hv.diagnosis}</span>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="consultation-right">
          <div className="form-group">
            <label><FileText size={14} /> Chief Complaint</label>
            <textarea
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="Patient's primary complaint"
              rows={2}
              disabled={isCompleted}
            />
          </div>

          <div className="form-group">
            <label>Diagnosis</label>
            <textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Diagnosis / findings"
              rows={2}
              disabled={isCompleted}
            />
          </div>

          <PrescriptionBuilder
            items={prescription}
            onChange={isCompleted ? () => {} : setPrescription}
          />

          <div className="form-group">
            <label>Additional Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Follow-up instructions, referrals, etc."
              rows={2}
              disabled={isCompleted}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Follow-up Date</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                disabled={isCompleted}
              />
            </div>
            {!isCompleted && (
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => navigate(`/ipd/admit?patientId=${visit.patientId}&visitId=${visitId}`)}
                >
                  Admit to IPD
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
