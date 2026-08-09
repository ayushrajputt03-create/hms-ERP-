import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import { ROLES } from '@lib/constants'
import { toISODate } from '@lib/utils'
import {
  CONSULTATION_TYPES, CONSULTATION_TYPE_LABELS,
  generateSlots, getSlotInputs, partRangeLabel, toMinutes,
} from '@lib/scheduling'
import QuickBookModal from './QuickBookModal'
import {
  ChevronLeft, ChevronRight, CalendarOff, Settings2, Info, X, Loader, AlertTriangle,
} from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Every date in the given month, as ISO strings. Built by incrementing a
// local Date rather than by string arithmetic so month lengths and leap years
// come from the platform.
function datesInMonth(year, month) {
  const out = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    out.push(toISODate(new Date(d)))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export default function SlotBookingPage() {
  const navigate = useNavigate()
  const { facilityId } = useFacility()

  const today = toISODate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [doctorId, setDoctorId] = useState('')
  const [consultationType, setConsultationType] = useState(CONSULTATION_TYPES.IN_CLINIC)
  const [activePart, setActivePart] = useState('morning')
  const [doctors, setDoctors] = useState([])
  const [inputs, setInputs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [booking, setBooking] = useState(null)

  useEffect(() => {
    if (!facilityId) return undefined
    return subscribeToCollection(`facilities/${facilityId}/staff`, (d) =>
      setDoctors(d.filter((s) => s.role === ROLES.DOCTOR && s.status === 'active')))
  }, [facilityId])

  useEffect(() => {
    if (doctorId || doctors.length === 0) return
    setDoctorId(doctors[0].id)
  }, [doctors, doctorId])

  // Re-fetched on every change of doctor, date or consultation type — the three
  // inputs that can change what is bookable. `live` guards against a slow
  // response for a previous date landing after a newer one.
  useEffect(() => {
    if (!facilityId || !doctorId || !selectedDate) { setInputs(null); return undefined }
    let live = true
    setLoading(true)
    setError('')
    getSlotInputs({ doctorId, date: selectedDate, consultationType })
      .then((data) => { if (live) setInputs(data) })
      .catch((err) => {
        console.error('Slot inputs error:', err)
        if (!live) return
        setInputs(null)
        setError('Could not load this doctor’s schedule. Please retry.')
      })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [facilityId, doctorId, selectedDate, consultationType])

  const result = useMemo(() => generateSlots({
    rules: inputs?.rules || [],
    leave: inputs?.leave || [],
    booked: inputs?.booked || [],
    date: selectedDate,
    consultationType,
  }), [inputs, selectedDate, consultationType])

  // Follow the day to a tab that actually has something in it, otherwise an
  // evening-only clinic opens on an empty Morning tab that reads as "no slots".
  useEffect(() => {
    if (!result.slots.length) return
    const current = result.parts.find((p) => p.key === activePart)
    if (current && current.slots.length) return
    const firstFilled = result.parts.find((p) => p.slots.length)
    if (firstFilled) setActivePart(firstFilled.key)
  }, [result, activePart])

  const monthDates = useMemo(
    () => datesInMonth(cursor.year, cursor.month), [cursor]
  )

  const shiftMonth = (delta) => {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }

  const part = result.parts.find((p) => p.key === activePart) || result.parts[0]
  const doctorName = doctors.find((d) => d.id === doctorId)?.name

  const openBooking = (slot) => {
    setBooking({
      doctorId,
      date: selectedDate,
      hour: Math.floor(toMinutes(slot.time) / 60),
      minute: toMinutes(slot.time) % 60,
      time: slot.time,
    })
  }

  return (
    <div className="slot-page">
      <div className="page-header">
        <div className="page-header-back">
          <button className="btn btn-icon" onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <h2>Select an Appointment Slot</h2>
        </div>
        <button className="btn btn-outline" onClick={() => navigate('/opd/availability')}>
          <Settings2 size={16} /> Availability Settings
        </button>
      </div>

      {/* Month cursor + horizontal date strip */}
      <div className="slot-month-nav">
        <button className="btn btn-icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <select
          value={`${cursor.year}-${cursor.month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number)
            setCursor({ year: y, month: m })
          }}
        >
          {/* One year either side of the current month is the whole realistic
              booking horizon for an OPD. */}
          {Array.from({ length: 25 }, (_, i) => {
            const d = new Date(new Date().getFullYear(), new Date().getMonth() - 12 + i, 1)
            return (
              <option key={i} value={`${d.getFullYear()}-${d.getMonth()}`}>
                {MONTHS[d.getMonth()]}, {d.getFullYear()}
              </option>
            )
          })}
        </select>
        <button className="btn btn-icon" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="slot-date-strip">
        {monthDates.map((iso) => {
          const d = new Date(`${iso}T00:00:00`)
          return (
            <button
              key={iso}
              className={`slot-date${iso === selectedDate ? ' active' : ''}${iso === today ? ' today' : ''}`}
              onClick={() => setSelectedDate(iso)}
            >
              <span className="slot-date-day">{d.getDate()}</span>
              <span className="slot-date-wd">{WEEKDAY_SHORT[d.getDay()]}</span>
            </button>
          )
        })}
      </div>

      <div className="form-row slot-controls">
        <div className="form-group">
          <label>Doctor</label>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.length === 0 && <option value="">No active doctors</option>}
            {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Consultation Type</label>
          <select value={consultationType} onChange={(e) => setConsultationType(e.target.value)}>
            {Object.values(CONSULTATION_TYPES).map((t) => (
              <option key={t} value={t}>{CONSULTATION_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>

      {!dismissed && (
        <div className="slot-disclaimer">
          <Info size={16} />
          <span>
            The slots below are based on the saved availability settings. To customise
            this schedule, update it in{' '}
            <button className="btn-link-inline" onClick={() => navigate('/opd/availability')}>
              Availability Settings
            </button>.
          </span>
          <button className="btn btn-icon btn-sm" onClick={() => setDismissed(true)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      {loading && (
        <div className="empty-state"><Loader size={18} className="spin" /> Loading slots…</div>
      )}

      {!loading && !error && result.onLeave && (
        <div className="empty-state slot-on-leave">
          <CalendarOff size={22} />
          <p>Dr. {doctorName} is on leave on this date. No slots are available.</p>
        </div>
      )}

      {!loading && !error && !result.onLeave && result.slots.length === 0 && (
        <div className="empty-state">
          <p>
            No {consultationType === CONSULTATION_TYPES.VIDEO ? 'video' : 'in-clinic'} slots
            for Dr. {doctorName || '—'} on this date.
          </p>
          <button className="btn btn-outline" onClick={() => navigate('/opd/availability')}>
            <Settings2 size={15} /> Set Availability
          </button>
        </div>
      )}

      {!loading && !error && !result.onLeave && result.slots.length > 0 && (
        <>
          <div className="tabs slot-tabs">
            {result.parts.map((p) => (
              <button
                key={p.key}
                className={`tab ${activePart === p.key ? 'active' : ''}`}
                onClick={() => setActivePart(p.key)}
                disabled={p.slots.length === 0}
              >
                {p.label}
                {p.slots.length > 0 && <span className="tab-count">{p.available}</span>}
              </button>
            ))}
          </div>

          <p className="slot-summary">
            <strong>{part.available} Slot{part.available === 1 ? '' : 's'} Available</strong>
            {partRangeLabel(part) && ` (${partRangeLabel(part)})`}
          </p>

          <div className="slot-grid">
            {part.slots.map((s) => (
              <button
                key={s.time}
                className={`slot-btn${s.disabled ? ' disabled' : ''}${s.remainder ? ' remainder' : ''}`}
                disabled={s.disabled}
                title={s.booked ? 'Already booked' : s.past ? 'This time has passed' : undefined}
                onClick={() => openBooking(s)}
              >
                {s.rangeLabel}
                {/* A remainder slot is shorter than the doctor's nominal slot
                    length, so it is marked rather than passed off as a normal one. */}
                {s.remainder && <AlertTriangle size={11} className="slot-remainder-icon" />}
              </button>
            ))}
          </div>
        </>
      )}

      {booking && (
        <QuickBookModal
          isOpen
          onClose={() => setBooking(null)}
          prefill={booking}
          doctors={doctors}
        />
      )}
    </div>
  )
}
