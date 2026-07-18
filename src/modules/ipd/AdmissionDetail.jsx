import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import {
  subscribeToDocument, subscribeToCollection, addDocument, updateDocument,
} from '@lib/db'
import { formatDate, formatINR } from '@lib/utils'
import Modal from '@components/Modal'
import {
  ChevronLeft, BedDouble, NotebookPen, ArrowRightLeft, LogOut, Send,
} from 'lucide-react'

export default function AdmissionDetail() {
  const { admissionId } = useParams()
  const navigate = useNavigate()
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const { can } = usePermission()

  const [admission, setAdmission] = useState(null)
  const [notes, setNotes] = useState([])
  const [wards, setWards] = useState([])
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [transferModal, setTransferModal] = useState(false)
  const [dischargeModal, setDischargeModal] = useState(false)

  useEffect(() => {
    if (!facilityId || !admissionId) return
    const unsubs = [
      subscribeToDocument(`facilities/${facilityId}/ipd/admissions/${admissionId}`, setAdmission),
      subscribeToCollection(`facilities/${facilityId}/ipd/admissions/${admissionId}/progressNotes`, (data) => {
        setNotes(data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
      }),
      subscribeToCollection(`facilities/${facilityId}/ipd/wards`, setWards),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId, admissionId])

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
    } finally {
      setSavingNote(false)
    }
  }

  if (!admission) return <div className="empty-state">Loading admission...</div>

  const isActive = admission.status === 'admitted'
  const days = Math.max(1, Math.ceil((Date.now() - (admission.admissionDate || Date.now())) / 86400000))
  const canUpdate = can('ipd', 'update')

  return (
    <div>
      <div className="page-header">
        <h2>
          <button className="btn btn-icon" onClick={() => navigate('/ipd')}><ChevronLeft size={20} /></button>
          <BedDouble size={22} /> {admission.patientName}
          <span className={`badge ${isActive ? 'badge-warning' : 'badge-success'}`}>{admission.status}</span>
        </h2>
        {isActive && canUpdate && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-outline" onClick={() => setTransferModal(true)}>
              <ArrowRightLeft size={14} /> Transfer
            </button>
            <button className="btn btn-primary" onClick={() => setDischargeModal(true)}>
              <LogOut size={14} /> Discharge
            </button>
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
        <div className="conditions-bar">
          <strong>Diagnosis:</strong> {admission.diagnosis}
        </div>
      )}

      {admission.status === 'discharged' && admission.dischargeSummary && (
        <div className="settings-section" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Discharge Summary</h3>
          <p><strong>Final Diagnosis:</strong> {admission.dischargeSummary.finalDiagnosis}</p>
          <p><strong>Treatment Given:</strong> {admission.dischargeSummary.treatment}</p>
          {admission.dischargeSummary.medicines && <p><strong>Medicines on Discharge:</strong> {admission.dischargeSummary.medicines}</p>}
          {admission.dischargeSummary.followUp && <p><strong>Follow-up:</strong> {admission.dischargeSummary.followUp}</p>}
        </div>
      )}

      <div className="settings-section">
        <h3 style={{ marginBottom: '0.75rem' }}><NotebookPen size={16} /> Daily Progress Notes</h3>

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

      {transferModal && (
        <TransferModal
          admission={admission}
          wards={wards}
          onClose={() => setTransferModal(false)}
          facilityId={facilityId}
          performedBy={staffProfile?.name || user?.email}
        />
      )}

      {dischargeModal && (
        <DischargeModal
          admission={admission}
          days={days}
          onClose={() => setDischargeModal(false)}
          facilityId={facilityId}
          performedBy={staffProfile?.name || user?.email}
          onDischarged={() => navigate('/ipd')}
        />
      )}
    </div>
  )
}

function TransferModal({ admission, wards, onClose, facilityId, performedBy }) {
  const [wardId, setWardId] = useState('')
  const [bedId, setBedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedWard = wards.find((w) => w.id === wardId)
  const vacantBeds = selectedWard
    ? Object.entries(selectedWard.beds || {}).filter(([, b]) => b.status !== 'occupied').map(([id, b]) => ({ id, ...b }))
    : []

  const handleTransfer = async () => {
    if (!wardId || !bedId) { setError('Select a ward and vacant bed.'); return }
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
        wardId,
        wardName: selectedWard?.name || '',
        bedId,
        bedName: bed?.name || '',
        ratePerDay: selectedWard?.ratePerDay ?? admission.ratePerDay,
      }, {
        user: performedBy, facilityId,
        audit: { action: 'patient_transferred', module: 'ipd' },
      })
      await addDocument(`facilities/${facilityId}/ipd/admissions/${admission.id}/progressNotes`, {
        text: `Transferred from ${admission.wardName}/${admission.bedName} to ${selectedWard?.name}/${bed?.name}.`,
        author: performedBy,
        authorRole: 'system',
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
            const vacant = Object.values(w.beds || {}).filter((b) => b.status !== 'occupied').length
            return <option key={w.id} value={w.id} disabled={vacant === 0}>{w.name} ({vacant} vacant)</option>
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

function DischargeModal({ admission, days, onClose, facilityId, performedBy, onDischarged }) {
  const [form, setForm] = useState({ finalDiagnosis: admission.diagnosis || '', treatment: '', medicines: '', followUp: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const bedCharges = days * (admission.ratePerDay || 0)
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleDischarge = async () => {
    if (!form.finalDiagnosis.trim()) { setError('Final diagnosis is required.'); return }
    if (!form.treatment.trim()) { setError('Treatment summary is required.'); return }

    setSaving(true)
    setError('')
    try {
      await updateDocument(`facilities/${facilityId}/ipd/admissions/${admission.id}`, {
        status: 'discharged',
        dischargedAt: Date.now(),
        stayDays: days,
        dischargeSummary: {
          finalDiagnosis: form.finalDiagnosis.trim(),
          treatment: form.treatment.trim(),
          medicines: form.medicines.trim() || null,
          followUp: form.followUp.trim() || null,
        },
      }, {
        user: performedBy, facilityId,
        audit: { action: 'patient_discharged', module: 'ipd' },
      })

      await updateDocument(`facilities/${facilityId}/ipd/wards/${admission.wardId}/beds/${admission.bedId}`, {
        status: 'vacant', admissionId: null,
      })

      await addDocument(`facilities/${facilityId}/billing`, {
        patientId: admission.patientId,
        patientName: admission.patientName,
        patientUhid: admission.patientUhid,
        type: 'ipd_bed_charges',
        description: `IPD Bed Charges — ${admission.wardName}/${admission.bedName} × ${days} day${days !== 1 ? 's' : ''} @ ${formatINR(admission.ratePerDay || 0)}/day`,
        amount: bedCharges,
        status: 'pending',
        admissionId: admission.id,
        invoiceDate: Date.now(),
        facilityId,
      })

      onDischarged()
    } catch (err) {
      console.error('Discharge error:', err)
      setError('Discharge failed. Please retry.')
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Discharge Patient" size="md">
      {error && <div className="auth-error">{error}</div>}
      <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
        Stay: {days} day{days !== 1 ? 's' : ''} — Bed charges {formatINR(bedCharges)} will be added to billing.
        {admission.deposit > 0 && ` Deposit paid: ${formatINR(admission.deposit)}.`}
      </p>
      <div className="form-group">
        <label>Final Diagnosis *</label>
        <textarea value={form.finalDiagnosis} onChange={update('finalDiagnosis')} rows={2} />
      </div>
      <div className="form-group">
        <label>Treatment Given *</label>
        <textarea value={form.treatment} onChange={update('treatment')} rows={2} />
      </div>
      <div className="form-group">
        <label>Medicines on Discharge</label>
        <textarea value={form.medicines} onChange={update('medicines')} rows={2} />
      </div>
      <div className="form-group">
        <label>Follow-up Instructions</label>
        <textarea value={form.followUp} onChange={update('followUp')} rows={2} />
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
