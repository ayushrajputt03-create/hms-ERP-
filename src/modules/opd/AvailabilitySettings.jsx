import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument, deleteDocument } from '@lib/db'
import { ROLES } from '@lib/constants'
import {
  CONSULTATION_TYPES, CONSULTATION_TYPE_LABELS, SLOT_DURATIONS,
  DAY_LABELS, DAY_NAMES, toMinutes,
} from '@lib/scheduling'
import Modal from '@components/Modal'
import { useToast } from '@components/Toast'
import {
  ChevronLeft, Plus, Trash2, CalendarOff, Clock, MapPin, Save,
} from 'lucide-react'

const emptyBlock = (facilityName) => ({
  locationName: facilityName || '',
  slotMinutes: 15,
  startTime: '09:00',
  endTime: '13:00',
  daysOfWeek: [1, 2, 3, 4, 5],
  isActive: true,
})

export default function AvailabilitySettings() {
  const navigate = useNavigate()
  const { facilityId, facilityConfig } = useFacility()
  const { user, staffProfile } = useAuth()
  const toast = useToast()

  const [staff, setStaff] = useState([])
  const [rules, setRules] = useState([])
  const [leave, setLeave] = useState([])
  const [doctorId, setDoctorId] = useState('')
  const [leaveModal, setLeaveModal] = useState(false)

  useEffect(() => {
    if (!facilityId) return undefined
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/staff`, (d) =>
        setStaff(d.filter((s) => s.role === ROLES.DOCTOR && s.status !== 'inactive'))),
      subscribeToCollection(`facilities/${facilityId}/doctorAvailability`, setRules),
      subscribeToCollection(`facilities/${facilityId}/doctorLeave`, setLeave),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  // A doctor editing their own hours should not have to find themselves in a
  // dropdown; an admin gets the first doctor as a starting point.
  useEffect(() => {
    if (doctorId || staff.length === 0) return
    const self = staff.find((s) => s.id === staffProfile?.id || s.uid === user?.uid)
    setDoctorId(self?.id || staff[0].id)
  }, [staff, doctorId, staffProfile, user])

  const auditOpts = {
    user: staffProfile?.name || user?.email,
    facilityId,
    audit: { action: 'update', module: 'opd', entityType: 'doctorAvailability' },
  }

  const forType = (type) => rules.filter((r) => r.doctorId === doctorId && r.consultationType === type)
  const doctorLeave = useMemo(
    () => leave.filter((l) => l.doctorId === doctorId)
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))),
    [leave, doctorId]
  )

  const handleSaveBlock = async (block) => {
    const payload = { ...block, doctorId, facilityId }
    if (block.id) {
      // Path-addressed update, so saving one card cannot touch a sibling.
      await updateDocument(`facilities/${facilityId}/doctorAvailability/${block.id}`, payload, auditOpts)
    } else {
      await addDocument(`facilities/${facilityId}/doctorAvailability`, payload, auditOpts)
    }
    toast.success('Availability saved.')
  }

  const handleDeleteBlock = async (id) => {
    await deleteDocument(`facilities/${facilityId}/doctorAvailability/${id}`, auditOpts)
    toast.success('Availability block removed.')
  }

  const handleAddLeave = async (entry) => {
    await addDocument(`facilities/${facilityId}/doctorLeave`, { ...entry, doctorId, facilityId }, auditOpts)
    setLeaveModal(false)
    toast.success('Leave added.')
  }

  const handleDeleteLeave = async (id) => {
    await deleteDocument(`facilities/${facilityId}/doctorLeave/${id}`, auditOpts)
    toast.success('Leave removed.')
  }

  return (
    <div className="availability-page">
      <div className="page-header">
        <div className="page-header-back">
          <button className="btn btn-icon" onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <h2>Change Schedule For Doctor</h2>
        </div>
        <button className="btn btn-outline" onClick={() => setLeaveModal(true)} disabled={!doctorId}>
          <CalendarOff size={16} /> Add Leave
        </button>
      </div>

      <div className="form-group availability-doctor-picker">
        <label>Doctor</label>
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          {staff.length === 0 && <option value="">No active doctors</option>}
          {staff.map((d) => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
        </select>
      </div>

      {!doctorId ? (
        <div className="empty-state">
          Add a doctor under Staff before setting consultation hours.
        </div>
      ) : (
        <>
          {doctorLeave.length > 0 && (
            <section className="availability-section">
              <h3>Leave</h3>
              <div className="leave-list">
                {doctorLeave.map((l) => (
                  <div key={l.id} className="leave-chip">
                    <CalendarOff size={14} />
                    <span>
                      {l.startDate}
                      {l.endDate && l.endDate !== l.startDate ? ` → ${l.endDate}` : ''}
                      {l.reason ? ` · ${l.reason}` : ''}
                    </span>
                    <button className="btn btn-icon btn-sm" onClick={() => handleDeleteLeave(l.id)}
                      aria-label="Remove leave">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {Object.values(CONSULTATION_TYPES).map((type) => (
            <AvailabilitySection
              key={type}
              type={type}
              blocks={forType(type)}
              facilityName={facilityConfig?.facilityName}
              onSave={(b) => handleSaveBlock({ ...b, consultationType: type })}
              onDelete={handleDeleteBlock}
            />
          ))}
        </>
      )}

      {leaveModal && (
        <LeaveModal onSave={handleAddLeave} onClose={() => setLeaveModal(false)} />
      )}
    </div>
  )
}

function AvailabilitySection({ type, blocks, facilityName, onSave, onDelete }) {
  // Unsaved new cards live here rather than in the collection, so an
  // abandoned "+ Add Schedule" never leaves a half-filled rule behind that
  // would start generating slots.
  const [drafts, setDrafts] = useState([])

  const addDraft = () => setDrafts((d) => [...d, { ...emptyBlock(facilityName), key: Date.now() }])
  const dropDraft = (key) => setDrafts((d) => d.filter((x) => x.key !== key))

  return (
    <section className="availability-section">
      <h3>Set Your {CONSULTATION_TYPE_LABELS[type]} Availability</h3>

      {blocks.length === 0 && drafts.length === 0 && (
        <p className="settings-hint">
          No {type === CONSULTATION_TYPES.VIDEO ? 'video' : 'in-clinic'} hours set.
          Slots for this type will not appear until a schedule is added.
        </p>
      )}

      {blocks.map((b) => (
        <AvailabilityCard key={b.id} block={b} onSave={onSave} onDelete={() => onDelete(b.id)} />
      ))}

      {drafts.map((d) => (
        <AvailabilityCard
          key={d.key}
          block={d}
          onSave={async (b) => { await onSave(b); dropDraft(d.key) }}
          onDelete={() => dropDraft(d.key)}
        />
      ))}

      <button className="btn btn-link availability-add" onClick={addDraft}>
        <Plus size={15} /> Add Schedule
      </button>
    </section>
  )
}

function AvailabilityCard({ block, onSave, onDelete }) {
  const [form, setForm] = useState(block)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Re-sync when the live subscription delivers a change from elsewhere,
  // keyed on id so a user's in-progress edits to a draft are not stamped over.
  useEffect(() => { setForm(block) }, [block.id])

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const toggleDay = (d) => setForm({
    ...form,
    daysOfWeek: form.daysOfWeek.includes(d)
      ? form.daysOfWeek.filter((x) => x !== d)
      : [...form.daysOfWeek, d].sort((a, b) => a - b),
  })

  const submit = async () => {
    const start = toMinutes(form.startTime)
    const end = toMinutes(form.endTime)
    if (start == null || end == null) { setError('Enter a valid start and end time.'); return }
    // Caught here as well as in generateSlots: the generator silently ignores
    // such a block, which from the editor would look like the save failed for
    // no reason.
    if (end <= start) { setError('End time must be after the start time.'); return }
    if (form.daysOfWeek.length === 0) { setError('Select at least one day.'); return }

    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        slotMinutes: Number(form.slotMinutes),
        // Drop the draft key so it never reaches the stored document.
        key: undefined,
      })
    } catch (err) {
      console.error('Availability save error:', err)
      setError('Could not save this schedule. Please retry.')
    } finally {
      setSaving(false)
    }
  }

  const slotCount = (() => {
    const s = toMinutes(form.startTime)
    const e = toMinutes(form.endTime)
    const n = Number(form.slotMinutes)
    if (s == null || e == null || !n || e <= s) return 0
    return Math.ceil((e - s) / n)
  })()

  return (
    <div className="availability-card">
      {error && <div className="auth-error">{error}</div>}

      <div className="form-row">
        <div className="form-group">
          <label><MapPin size={14} /> Location</label>
          <input value={form.locationName || ''} onChange={set('locationName')}
            placeholder="e.g. ganesh hospital" />
        </div>
        <div className="form-group">
          <label><Clock size={14} /> Time Slot</label>
          <select value={form.slotMinutes} onChange={set('slotMinutes')}>
            {SLOT_DURATIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Start Time</label>
          <input type="time" value={form.startTime} onChange={set('startTime')} />
        </div>
        <div className="form-group">
          <label>End Time</label>
          <input type="time" value={form.endTime} onChange={set('endTime')} />
        </div>
      </div>

      <div className="form-group">
        <label>Days of Week</label>
        <div className="day-toggles">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              className={`day-toggle ${form.daysOfWeek.includes(i) ? 'active' : ''}`}
              aria-pressed={form.daysOfWeek.includes(i)}
              aria-label={DAY_NAMES[i]}
              title={DAY_NAMES[i]}
              onClick={() => toggleDay(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="availability-card-footer">
        <span className="settings-hint">
          {slotCount > 0
            ? `${slotCount} slot${slotCount === 1 ? '' : 's'} per selected day`
            : 'No slots — check the times'}
        </span>
        <div className="form-actions">
          <button className="btn btn-outline btn-danger btn-sm" onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LeaveModal({ onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ startDate: today, endDate: today, reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value })

  const submit = async () => {
    if (!form.startDate) { setError('Pick a start date.'); return }
    if (form.endDate && form.endDate < form.startDate) {
      setError('End date cannot be before the start date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, endDate: form.endDate || form.startDate })
    } catch (err) {
      console.error('Add leave error:', err)
      setError('Could not save this leave. Please retry.')
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Add Leave" size="sm">
      {error && <div className="auth-error">{error}</div>}
      <div className="form-row">
        <div className="form-group">
          <label>From</label>
          <input type="date" value={form.startDate} onChange={set('startDate')} />
        </div>
        <div className="form-group">
          <label>To</label>
          <input type="date" value={form.endDate} min={form.startDate} onChange={set('endDate')} />
        </div>
      </div>
      <div className="form-group">
        <label>Reason (optional)</label>
        <input value={form.reason} onChange={set('reason')} placeholder="e.g. conference" />
      </div>
      <p className="settings-hint">
        All slots for these dates are withdrawn, whatever the weekly schedule says.
        Appointments already booked are not cancelled — check the queue for those.
      </p>
      <div className="form-actions">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Add Leave'}
        </button>
      </div>
    </Modal>
  )
}
