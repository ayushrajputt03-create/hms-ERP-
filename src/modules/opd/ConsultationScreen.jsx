import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { getDocument, updateDocument, queryDocuments, subscribeToCollection } from '@lib/db'
import { completeOpdVisit } from '@lib/opd'
import { formatDate, calculateAge } from '@lib/utils'
import { stockByMedicine } from '@lib/pharmacy'
import { flagVitals, checkPrescriptionAllergies } from '@lib/clinical'
import { buildPrescriptionPDF } from '@lib/pdf'
import PrescriptionBuilder from './PrescriptionBuilder'
import Modal from '@components/Modal'
import {
  ChevronLeft, AlertTriangle, Heart, Thermometer, Activity,
  Droplets, Save, CheckCircle, FileText, Clock, Printer,
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
  const [medicines, setMedicines] = useState([])
  const [batches, setBatches] = useState([])
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(null)

  const stock = useMemo(() => stockByMedicine(batches), [batches])
  const vitalFlags = useMemo(() => flagVitals(vitals), [vitals])
  const allergies = patient?.allergies || []

  useEffect(() => {
    if (!facilityId || !visitId) return
    loadVisit()
  }, [facilityId, visitId])

  // Pharmacy catalog drives prescription autocomplete and live stock hints.
  useEffect(() => {
    if (!facilityId) return
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/pharmacy/medicines`, setMedicines),
      subscribeToCollection(`facilities/${facilityId}/pharmacy/batches`, setBatches),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

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

  const draft = () => ({
    vitals: { ...vitals, bmi },
    chiefComplaint: chiefComplaint.trim(),
    diagnosis: diagnosis.trim(),
    notes: notes.trim(),
    prescription,
    followUpDate: followUpDate || null,
  })

  const persistDraft = async (silent) => {
    await updateDocument(`facilities/${facilityId}/opdVisits/${visitId}`, {
      ...draft(),
      status: 'in_progress',
    }, {
      user: staffProfile?.name || user?.email,
      facilityId,
      audit: { action: silent ? 'consultation_autosaved' : 'consultation_saved', module: 'opd' },
    })
    setLastSavedAt(Date.now())
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await persistDraft(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save consultation.')
    } finally {
      setSaving(false)
    }
  }

  // Autosave the draft so a closed tab or refresh never loses the doctor's typing.
  // The interval reads through refs so continuous typing never resets the timer.
  const dirtyRef = useRef(false)
  const saveRef = useRef(persistDraft)
  saveRef.current = persistDraft

  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    dirtyRef.current = true
  }, [vitals, chiefComplaint, diagnosis, notes, prescription, followUpDate])

  const isDraft = !loading && !!visit && visit.status !== 'completed'
  useEffect(() => {
    if (!isDraft) return
    const id = setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      saveRef.current(true).catch((err) => {
        dirtyRef.current = true
        console.error('Autosave failed:', err)
      })
    }, 20000)
    return () => clearInterval(id)
  }, [isDraft])

  const requestEndVisit = () => {
    const blocking = []
    if (!chiefComplaint.trim()) blocking.push('Chief complaint is empty.')
    if (!diagnosis.trim()) blocking.push('Diagnosis is empty.')

    const warnings = []
    const critical = Object.values(vitalFlags).filter((f) => f.level === 'critical')
    critical.forEach((f) => warnings.push(f.text))
    checkPrescriptionAllergies(prescription, allergies).forEach(({ item, conflicts }) => {
      warnings.push(`${item.medicine} conflicts with recorded allergy: ${conflicts.map((c) => c.allergy).join(', ')}.`)
    })

    if (blocking.length === 0 && warnings.length === 0) { handleEndVisit(); return }
    setConfirmEnd({ blocking, warnings })
  }

  const handlePrintRx = () => {
    const pdf = buildPrescriptionPDF({
      facility: facilityConfig || {},
      patient,
      visit: {
        ...visit,
        ...draft(),
        patientAgeSex: patient?.dob
          ? `${calculateAge(patient.dob)}Y / ${(patient.gender || '').charAt(0).toUpperCase()}`
          : '—',
      },
      doctor: {
        name: visit.doctorName,
        registrationNumber: staffProfile?.registrationNumber,
        qualification: staffProfile?.qualification,
      },
    })
    pdf.save(`Rx-${patient?.uhid || visit.patientUhid || visitId}.pdf`)
  }

  const handleEndVisit = async () => {
    setConfirmEnd(null)
    setSaving(true)
    setError('')
    try {
      // The server resolves the consultation fee from the tariff master and
      // stamps status/completedAt/billed itself — the client never sends an
      // amount, so a tampered request cannot set its own price.
      await completeOpdVisit({ facilityId, visitId, clinical: draft() })

      if (patient) {
        await updateDocument(`facilities/${facilityId}/patients/${visit.patientId}`, {
          lastVisitDate: Date.now(),
        })
      }

      navigate('/opd/queue')
    } catch (err) {
      console.error('End visit error:', err)
      setError(
        err.message?.includes('VISIT_ALREADY_COMPLETED')
          ? 'This visit was already completed elsewhere.'
          : 'Failed to end visit.'
      )
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
          {lastSavedAt && !isCompleted && (
            <span className="autosave-hint">Draft saved {formatDate(lastSavedAt, 'time')}</span>
          )}
          <button className="btn btn-outline" onClick={handlePrintRx}>
            <Printer size={14} /> Print Rx
          </button>
          {!isCompleted && (
            <>
              <button className="btn btn-outline" onClick={handleSave} disabled={saving}>
                <Save size={14} /> {saved ? 'Saved!' : 'Save'}
              </button>
              <button className="btn btn-primary" onClick={requestEndVisit} disabled={saving}>
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
              <VitalField label={<><Activity size={12} /> BP (mmHg)</>} value={vitals.bp}
                onChange={updateVital('bp')} placeholder="120/80" disabled={isCompleted} flag={vitalFlags.bp} />
              <VitalField label={<><Thermometer size={12} /> Temp (°F)</>} value={vitals.temp}
                onChange={updateVital('temp')} placeholder="98.6" disabled={isCompleted} flag={vitalFlags.temp} />
              <VitalField label={<><Heart size={12} /> Pulse (bpm)</>} value={vitals.pulse}
                onChange={updateVital('pulse')} placeholder="72" disabled={isCompleted} flag={vitalFlags.pulse} />
              <VitalField label={<><Droplets size={12} /> SpO2 (%)</>} value={vitals.spo2}
                onChange={updateVital('spo2')} placeholder="98" disabled={isCompleted} flag={vitalFlags.spo2} />
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
                  {hv.vitals && <HistoryVitals vitals={hv.vitals} />}
                  {hv.prescription?.length > 0 && (
                    <span className="history-rx">
                      Rx: {hv.prescription.map((p) => p.medicine).filter(Boolean).join(', ')}
                    </span>
                  )}
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
            medicines={medicines}
            stock={stock}
            allergies={allergies}
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

      {confirmEnd && (
        <Modal isOpen onClose={() => setConfirmEnd(null)} title="Review before ending visit">
          {confirmEnd.blocking.length > 0 && (
            <div className="confirm-section">
              <strong>Incomplete record</strong>
              <ul>{confirmEnd.blocking.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
          {confirmEnd.warnings.length > 0 && (
            <div className="confirm-section confirm-section-danger">
              <strong><AlertTriangle size={14} /> Clinical warnings</strong>
              <ul>{confirmEnd.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <p className="text-muted">
            Ending the visit locks this record and makes it billable. Go back and correct it, or confirm to proceed.
          </p>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={() => setConfirmEnd(null)}>Go back &amp; edit</button>
            <button className="btn btn-primary" onClick={handleEndVisit} disabled={saving}>
              End visit anyway
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function VitalField({ label, value, onChange, placeholder, disabled, flag }) {
  return (
    <div className={`form-group vital-field ${flag ? `vital-${flag.level}` : ''}`}>
      <label>{label}</label>
      <input value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
      {flag && <span className={`vital-flag vital-flag-${flag.level}`}>{flag.text}</span>}
    </div>
  )
}

function HistoryVitals({ vitals }) {
  const parts = [
    vitals.bp && `BP ${vitals.bp}`,
    vitals.pulse && `Pulse ${vitals.pulse}`,
    vitals.temp && `Temp ${vitals.temp}°F`,
    vitals.spo2 && `SpO2 ${vitals.spo2}%`,
    vitals.weight && `Wt ${vitals.weight}kg`,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return <span className="history-vitals">{parts.join(' · ')}</span>
}
