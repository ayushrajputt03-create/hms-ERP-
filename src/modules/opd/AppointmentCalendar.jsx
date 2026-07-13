import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import { subscribeToCollection } from '@lib/db'
import { formatDate, toISODate } from '@lib/utils'
import QuickBookModal from './QuickBookModal'
import {
  Stethoscope, ChevronLeft, ChevronRight, Plus, Calendar, Clock,
} from 'lucide-react'

const STATUS_COLORS = {
  booked: 'var(--accent)',
  checked_in: 'var(--warning)',
  in_progress: 'var(--primary)',
  completed: 'var(--success)',
  no_show: 'var(--text-muted)',
  cancelled: 'var(--danger)',
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8)

export default function AppointmentCalendar() {
  const navigate = useNavigate()
  const { staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const { can } = usePermission()
  const [visits, setVisits] = useState([])
  const [staff, setStaff] = useState([])
  const [view, setView] = useState('day')
  const [currentDate, setCurrentDate] = useState(toISODate(new Date()))
  const [bookModal, setBookModal] = useState(null)

  useEffect(() => {
    if (!facilityId) return
    const unsubs = []
    unsubs.push(subscribeToCollection(`facilities/${facilityId}/opdVisits`, setVisits))
    unsubs.push(subscribeToCollection(`facilities/${facilityId}/staff`, (data) => {
      setStaff(data.filter((s) => s.role === 'doctor' && s.status === 'active'))
    }))
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const dateObj = useMemo(() => new Date(currentDate + 'T00:00:00'), [currentDate])

  const weekDates = useMemo(() => {
    if (view !== 'week') return []
    const start = new Date(dateObj)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return toISODate(d)
    })
  }, [view, dateObj])

  const visitsForDate = (date) =>
    visits.filter((v) => {
      const vDate = v.visitDate ? toISODate(new Date(v.visitDate)) : null
      return vDate === date
    })

  const navigate_date = (delta) => {
    const d = new Date(dateObj)
    d.setDate(d.getDate() + (view === 'week' ? delta * 7 : delta))
    setCurrentDate(toISODate(d))
  }

  const handleSlotClick = (doctorId, date, hour) => {
    if (!can('opd', 'create')) return
    setBookModal({ doctorId, date, hour })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><Stethoscope size={22} /> OPD — Appointments</h2>
          <p>{staff.length} doctor{staff.length !== 1 ? 's' : ''} on roster</p>
        </div>
        <div className="calendar-controls">
          <div className="view-toggle">
            <button className={`btn ${view === 'day' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('day')}>Day</button>
            <button className={`btn ${view === 'week' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('week')}>Week</button>
          </div>
          {can('opd', 'create') && (
            <button className="btn btn-primary" onClick={() => setBookModal({ date: currentDate })}>
              <Plus size={16} /> Book Appointment
            </button>
          )}
        </div>
      </div>

      <div className="calendar-nav">
        <button className="btn btn-icon" onClick={() => navigate_date(-1)}><ChevronLeft size={18} /></button>
        <div className="calendar-date-display">
          <Calendar size={16} />
          {view === 'day'
            ? formatDate(dateObj, 'long')
            : `${formatDate(new Date(weekDates[0] + 'T00:00:00'), 'short')} — ${formatDate(new Date(weekDates[6] + 'T00:00:00'), 'short')}`
          }
        </div>
        <button className="btn btn-icon" onClick={() => navigate_date(1)}><ChevronRight size={18} /></button>
        <button className="btn btn-outline btn-sm" onClick={() => setCurrentDate(toISODate(new Date()))}>Today</button>
      </div>

      {view === 'day' ? (
        <DayView
          date={currentDate}
          doctors={staff}
          visits={visitsForDate(currentDate)}
          onSlotClick={handleSlotClick}
          onVisitClick={(v) => navigate(`/opd/consultation/${v.id}`)}
        />
      ) : (
        <WeekView
          dates={weekDates}
          doctors={staff}
          allVisits={visits}
          onSlotClick={handleSlotClick}
          onVisitClick={(v) => navigate(`/opd/consultation/${v.id}`)}
        />
      )}

      {bookModal && (
        <QuickBookModal
          isOpen={!!bookModal}
          onClose={() => setBookModal(null)}
          prefill={bookModal}
          doctors={staff}
        />
      )}
    </div>
  )
}

function DayView({ date, doctors, visits, onSlotClick, onVisitClick }) {
  if (doctors.length === 0) {
    return <div className="empty-state">No doctors on the roster. Add doctors from Staff Management first.</div>
  }

  return (
    <div className="calendar-grid">
      <div className="calendar-header-row">
        <div className="calendar-time-col">Time</div>
        {doctors.map((doc) => (
          <div key={doc.id} className="calendar-doctor-col">{doc.name}</div>
        ))}
      </div>
      {HOURS.map((hour) => (
        <div key={hour} className="calendar-row">
          <div className="calendar-time-col">
            <Clock size={12} /> {hour.toString().padStart(2, '0')}:00
          </div>
          {doctors.map((doc) => {
            const slotVisits = visits.filter((v) => {
              const vHour = v.visitDate ? new Date(v.visitDate).getHours() : null
              return v.doctorId === doc.id && vHour === hour
            })
            return (
              <div
                key={doc.id}
                className="calendar-cell"
                onClick={() => slotVisits.length === 0 && onSlotClick(doc.id, date, hour)}
              >
                {slotVisits.map((v) => (
                  <div
                    key={v.id}
                    className="calendar-event"
                    style={{ borderLeftColor: STATUS_COLORS[v.status] || STATUS_COLORS.booked }}
                    onClick={(e) => { e.stopPropagation(); onVisitClick(v) }}
                  >
                    <span className="event-name">{v.patientName || 'Patient'}</span>
                    <span className="event-status">{v.status}</span>
                  </div>
                ))}
                {slotVisits.length === 0 && <span className="slot-empty">+</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function WeekView({ dates, doctors, allVisits, onSlotClick, onVisitClick }) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="week-grid">
      <div className="week-header-row">
        <div className="week-label-col"></div>
        {dates.map((d) => {
          const dt = new Date(d + 'T00:00:00')
          const isToday = d === toISODate(new Date())
          return (
            <div key={d} className={`week-day-col ${isToday ? 'week-today' : ''}`}>
              <span className="week-day-name">{dayNames[dt.getDay()]}</span>
              <span className="week-day-num">{dt.getDate()}</span>
            </div>
          )
        })}
      </div>
      {doctors.map((doc) => (
        <div key={doc.id} className="week-doctor-row">
          <div className="week-label-col week-doctor-name">{doc.name}</div>
          {dates.map((d) => {
            const dayVisits = allVisits.filter((v) => {
              const vDate = v.visitDate ? toISODate(new Date(v.visitDate)) : null
              return vDate === d && v.doctorId === doc.id
            })
            return (
              <div key={d} className="week-cell" onClick={() => dayVisits.length === 0 && onSlotClick(doc.id, d, 9)}>
                {dayVisits.length > 0 ? (
                  <div className="week-cell-count">
                    {dayVisits.map((v) => (
                      <div
                        key={v.id}
                        className="week-event-dot"
                        style={{ background: STATUS_COLORS[v.status] || STATUS_COLORS.booked }}
                        title={`${v.patientName || 'Patient'} — ${v.status}`}
                        onClick={(e) => { e.stopPropagation(); onVisitClick(v) }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="slot-empty">+</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {doctors.length === 0 && <div className="empty-state">No doctors on roster.</div>}
    </div>
  )
}
