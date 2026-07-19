import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import {
  subscribeToDocument, subscribeToCollection, addDocument, updateDocument,
} from '@lib/db'
import { dischargePatient, administerDose } from '@lib/ipd'
import { canBill } from '@lib/billing'
import { formatDate, formatINR } from '@lib/utils'
import { useToast } from '@components/Toast'
import Modal from '@components/Modal'
import {
  ChevronLeft, BedDouble, NotebookPen, Pill, ArrowRightLeft, LogOut, Send,
  Plus, CheckCircle2, Check,
} from 'lucide-react'

export default function AdmissionDetail() {
  const { admissionId } = useParams()
  const navigate = useNavigate()
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const { can } = usePermission()
  const toast = useToast()
  const role = staffProfile?.role

  const [admission, setAdmission] = useState(null)
  const [notes, setNotes] = useState([])
  const [doses, setDoses] = useState([])
  const [staff, setStaff] = useState([])
  const [wards, setWards] = useState([])
  const [tab, setTab] = useState('notes')
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [transferModal, setTransferModal] = useState(false)
  const [dischargeModal, setDischargeModal] = useState(false)

  useEffect(() => {
    if (!facilityId || !admissionId) return
    const base = `facilities/${facilityId}/ipd/admissions/${admissionId}`
    const unsubs = [
      subscribeToDocument(base, setAdmission),
      subscribeToCollection(`${base}/progressNotes`, (data) =>
        setNotes(data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))),
      subscribeToCollection(`${base}/mar`, (data) =>
        setDoses(data.sort((a, b) => (a.scheduledTime || 0) - (b.scheduledTime || 0)))),
      subscribeToCollection(`facilities/${facilityId}/ipd/wards`, setWards),
      subscribeToCollection(`facilities/${facilityId}/staff`, setStaff),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId, admissionId])

  const staffName = (uid) => staff.find((s) => s.id === uid)?.name || 'staff'

  const addNote = async () => {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      await addDocument(`facilities/${facilityId}/ipd/admissions/${admissionId}/progressNotes`, {
        text: noteText.trim(),
        author: staffProfile?.name || user?.email,
        authorRole: staffProfile?.role || '',
      })
      setNoteText('')
    } catch (err) {
      console.error('Note error:', err)
      toast.error('Failed to add note.')
    } finally {
      setSavingNote(false)
    }
  }

  const markAdministered = async (doseId) => {
    try {
      await administerDose({ admissionId, doseId })
    } catch (err) {
      console.error('MAR error:', err)
      toast.error(err.message || 'Failed to record dose.')
    }
  }

  if (!admission) return <div className="empty-state">Loading admission...</div>

  const isActive = admission.status === 'admitted'
  const days = admission.stayDays
    || Math.max(1, Math.ceil((Date.now() - (admission.admissionDate || Date.now())) / 86400000))
  const canUpdate = can('ipd', 'update')
  const canDischarge = ['facility_admin', 'super_admin', 'doctor', 'receptionist'].includes(role)

  return (
    <div>
      <div className="page-header">
        <h2>
          <button className="btn btn-icon" onClick={() => navigate('/ipd')}><ChevronLeft size={20} /></button>
          <BedDouble size={22} /> {admission.patientName}
          <span className={`badge ${isActive ? 'badge-warning' : 'badge-success'}`}>{admission.status}</span>
        </h2>
        {isActive && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {canUpdate && (
              <button className="btn btn-outline" onClick={() => setTransferModal(true)}>
                <ArrowRightLeft size={14} /> Transfer
              </button>
            )}
            {canDischarge && (
              <button className="btn btn-primary" onClick={() => setDischargeModal(true)}>
                <LogOut size={14} /> Discharge
              </button>
            )}
          </div>
        )}
      </div>

      <div className="consultation-header-bar">
        <div>
          <span className="font-mono">{admission.patientUhid}</span>
          <span> — {admission.wardName} / {admission.bedName}</span>
          <span> — Dr. {admission.doctorName}</span>
        </div>
        <div>
          <span>Admitted {formatDate(admission.admissionDate, 'datetime')}</span>
          <span> — Day {days}</span>
          <span> — Est. bed charges: {formatINR(days * (admission.ratePerDay || 0))}</span>
        </div>
      </div>

      {admission.diagnosis && (
        <div className="conditions-bar"><strong>Diagnosis:</strong> {admission.diagnosis}</div>
      )}

      {admission.status === 'discharged' && admission.dischargeSummary && (
        <div className="settings-section" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Discharge Summary</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{admission.dischargeSummary}</p>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
          <NotebookPen size={15} /> Progress Notes
        </button>
        <button className={`tab ${tab === 'mar' ? 'active' : ''}`} onClick={() => setTab('mar')}>
          <Pill size={15} /> Medication (MAR)
        </button>
      </div>

      {tab === 'notes' && (
        <div className="settings-section">
          {isActive && canUpdate && (
            <div className="note-input-row">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add progress note (vitals, observations, treatment updates)..."
                rows={2}
              />
              <button className="btn btn-primary" onClick={addNote} disabled={savingNote || !noteText.trim()}>
                <Send size={14} /> {savingNote ? 'Adding...' : 'Add'}
              </button>
            </div>
          )}
          {/* Notes are append-only — there is intentionally no edit or delete. */}
          {notes.length === 0 ? (
            <p className="text-muted">No progress notes yet.</p>
          ) : (
            <div className="notes-list">
              {notes.map((n) => (
                <div key={n.id} className="note-item">
                  <div className="note-meta">
                    <strong>{n.author}</strong>
                    {n.authorRole && <span className="badge badge-muted">{n.authorRole.replace('_', ' ')}</span>}
                    <span className="text-muted">{formatDate(n.createdAt, 'datetime')}</span>
                  </div>
                  <p>{n.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'mar' && (
        <MarTab
          doses={doses}
          isActive={isActive}
          canUpdate={canUpdate}
          facilityId={facilityId}
          admissionId={admissionId}
          onAdminister={markAdministered}
          staffName={staffName}
        />
      )}

      {transferModal && (
        <TransferModal
          admission={admission} wards={wards} onClose={() => setTransferModal(false)}
          facilityId={facilityId} performedBy={staffProfile?.name || user?.email}
        />
      )}

      {dischargeModal && (
        <DischargeModal
          admission={admission} days={days} onClose={() => setDischargeModal(false)}
          onDischarged={() => {
            if (canBill(role)) {
              toast.success('Patient discharged. Room charges are ready to bill.')
              navigate(`/billing?patientId=${admission.patientId}`)
            } else {
              toast.success('Patient discharged. Room charges are queued in Billing.')
              navigate('/ipd')
            }
          }}
        />
      )}
    </div>
  )
}

function MarTab({ doses, isActive, canUpdate, facilityId, admissionId, onAdminister, staffName }) {
  const [form, setForm] = useState({ medicine: '', dosage: '', scheduledTime: '' })
  const [saving, setSaving] = useState(false)

  const addDose = async () => {
    if (!form.medicine.trim()) return
    setSaving(true)
    try {
      await addDocument(`facilities/${facilityId}/ipd/admissions/${admissionId}/mar`, {
        medicine: form.medicine.trim(),
        dosage: form.dosage.trim() || null,
        scheduledTime: form.scheduledTime ? new Date(form.scheduledTime).getTime() : Date.now(),
        administered: false,
      })
      setForm({ medicine: '', dosage: '', scheduledTime: '' })
    } catch (err) {
      console.error('Add dose error:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-section">
      {isActive && canUpdate && (
        <div className="form-row" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Medicine</label>
            <input value={form.medicine} onChange={(e) => setForm({ ...form, medicine: e.target.value })} placeholder="e.g. Ceftriaxone" />
          </div>
          <div className="form-group">
            <label>Dosage</label>
            <input value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="1g IV" />
          </div>
          <div className="form-group">
            <label>Scheduled</label>
            <input type="datetime-local" value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} />
          </div>
          <button className="btn btn-outline" onClick={addDose} disabled={saving || !form.medicine.trim()} style={{ marginBottom: '1rem' }}>
            <Plus size={14} /> Add Dose
          </button>
        </div>
      )}

      {doses.length === 0 ? (
        <p className="text-muted">No scheduled doses.</p>
      ) : (
        <div className="mar-list">
          {doses.map((d) => (
            <div key={d.id} className={`mar-row ${d.administered ? 'mar-done' : ''}`}>
              <div className="mar-info">
                <strong>{d.medicine}</strong>{d.dosage ? ` — ${d.dosage}` : ''}
                <span className="text-muted"> · scheduled {formatDate(d.scheduledTime, 'datetime')}</span>
              </div>
              {d.administered ? (
                <div className="mar-given">
                  <CheckCircle2 size={15} />
                  <span>Given by {staffName(d.administeredBy)} · {formatDate(d.administeredAt, 'datetime')}</span>
                </div>
              ) : isActive && canUpdate ? (
                <button className="btn btn-primary btn-sm" onClick={() => onAdminister(d.id)}>
                  <Check size={14} /> Mark given
                </button>
              ) : (
                <span className="badge badge-muted">Pending</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TransferModal({ admission, wards, onClose, facilityId, performedBy }) {
  const [wardId, setWardId] = useState('')
  const [bedId, setBedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAvailable = (b) => !b.status || b.status === 'vacant'
  const selectedWard = wards.find((w) => w.id === wardId)
  const vacantBeds = selectedWard
    ? Object.entries(selectedWard.beds || {}).filter(([, b]) => isAvailable(b)).map(([id, b]) => ({ id, ...b }))
    : []

  const handleTransfer = async () => {
    if (!wardId || !bedId) { setError('Select a ward and available bed.'); return }
    setSaving(true)
    setError('')
    try {
      const bed = vacantBeds.find((b) => b.id === bedId)
      await updateDocument(`facilities/${facilityId}/ipd/wards/${admission.wardId}/beds/${admission.bedId}`, {
        status: 'vacant', admissionId: null,
      })
      await updateDocument(`facilities/${facilityId}/ipd/wards/${wardId}/beds/${bedId}`, {
        status: 'occupied', admissionId: admission.id,
      })
      await updateDocument(`facilities/${facilityId}/ipd/admissions/${admission.id}`, {
        wardId, wardName: selectedWard?.name || '', bedId, bedName: bed?.name || '',
        ratePerDay: selectedWard?.ratePerDay ?? admission.ratePerDay,
      }, {
        user: performedBy, facilityId, audit: { action: 'patient_transferred', module: 'ipd' },
      })
      await addDocument(`facilities/${facilityId}/ipd/admissions/${admission.id}/progressNotes`, {
        text: `Transferred from ${admission.wardName}/${admission.bedName} to ${selectedWard?.name}/${bed?.name}.`,
        author: performedBy, authorRole: 'system',
      })
      onClose()
    } catch (err) {
      console.error('Transfer error:', err)
      setError('Transfer failed. Please retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Transfer Patient" size="sm">
      {error && <div className="auth-error">{error}</div>}
      <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
        Current: {admission.wardName} / {admission.bedName}
      </p>
      <div className="form-group">
        <label>New Ward</label>
        <select value={wardId} onChange={(e) => { setWardId(e.target.value); setBedId('') }}>
          <option value="">Select ward...</option>
          {wards.map((w) => {
            const vacant = Object.values(w.beds || {}).filter(isAvailable).length
            return <option key={w.id} value={w.id} disabled={vacant === 0}>{w.name} ({vacant} available)</option>
          })}
        </select>
      </div>
      <div className="form-group">
        <label>New Bed</label>
        <select value={bedId} onChange={(e) => setBedId(e.target.value)} disabled={!wardId}>
          <option value="">Select bed...</option>
          {vacantBeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="form-actions">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleTransfer} disabled={saving}>
          {saving ? 'Transferring...' : 'Transfer'}
        </button>
      </div>
    </Modal>
  )
}

function DischargeModal({ admission, days, onClose, onDischarged }) {
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const bedCharges = days * (admission.ratePerDay || 0)

  const handleDischarge = async () => {
    if (!summary.trim()) { setError('A discharge summary is required.'); return }
    setSaving(true)
    setError('')
    try {
      // Atomic: writes summary, computes stay days, flips the bed to 'cleaning'.
      await dischargePatient({ admissionId: admission.id, summary: summary.trim() })
      onDischarged()
    } catch (err) {
      console.error('Discharge error:', err)
      setError(err.message || 'Discharge failed. Please retry.')
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Discharge Patient" size="md">
      {error && <div className="auth-error">{error}</div>}
      <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
        Stay: {days} day{days !== 1 ? 's' : ''} — Room charges {formatINR(bedCharges)} will be queued in Billing
        ({admission.wardName}/{admission.bedName} @ {formatINR(admission.ratePerDay || 0)}/day). The bed is set to
        "cleaning" on discharge.
      </p>
      <div className="form-group">
        <label>Discharge Summary *</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          placeholder="Final diagnosis, treatment given, medicines on discharge, follow-up instructions…"
        />
      </div>
      <div className="form-actions">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleDischarge} disabled={saving}>
          {saving ? 'Discharging...' : 'Discharge & Bill'}
        </button>
      </div>
    </Modal>
  )
}
