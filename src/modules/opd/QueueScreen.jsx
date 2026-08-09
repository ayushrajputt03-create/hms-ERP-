import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, updateDocument, getDocument } from '@lib/db'
import { toISODate } from '@lib/utils'
import { buildOpdSlipPDF, printPDF } from "@lib/pdf"
import { departmentSummary } from '@lib/departments'
import SelfCheckinQR from './SelfCheckinQR'
import { ListOrdered, CheckCircle, Clock, UserCheck, XCircle, Printer, UserPlus, QrCode } from 'lucide-react'

const STATUS_ICONS = {
  booked: Clock,
  checked_in: UserCheck,
  in_progress: Clock,
  completed: CheckCircle,
  no_show: XCircle,
}

export default function QueueScreen() {
  const navigate = useNavigate()
  const { user, staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()
  const [visits, setVisits] = useState([])
  const [staff, setStaff] = useState([])
  const [selectedDoctor, setSelectedDoctor] = useState('all')
  const today = toISODate(new Date())

  useEffect(() => {
    if (!facilityId) return
    const unsubs = []
    unsubs.push(subscribeToCollection(`facilities/${facilityId}/opdVisits`, (data) => {
      const todayVisits = data.filter((v) => {
        const vDate = v.visitDate ? toISODate(new Date(v.visitDate)) : null
        return vDate === today
      })
      setVisits(todayVisits.sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0)))
    }))
    unsubs.push(subscribeToCollection(`facilities/${facilityId}/staff`, (data) => {
      setStaff(data.filter((s) => s.role === 'doctor' && s.status === 'active'))
    }))
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId, today])

  const byDoctor = selectedDoctor === 'all'
    ? visits
    : visits.filter((v) => v.doctorId === selectedDoctor)

  const pendingQr = byDoctor.filter((v) => v.bookingSource === 'qr_self' && !v.verified)
  const filtered = byDoctor.filter((v) => !(v.bookingSource === 'qr_self' && !v.verified))

  const handleCheckIn = async (visit) => {
    await updateDocument(`facilities/${facilityId}/opdVisits/${visit.id}`, {
      status: 'checked_in',
      checkedInAt: Date.now(),
    }, {
      user: staffProfile?.name || user?.email,
      facilityId,
      audit: { action: 'patient_checked_in', module: 'opd' },
    })
  }

  // A QR self-booking has no reception-verified identity yet — this is the
  // one click that both confirms the walk-in matches the token and moves
  // them into the normal checked-in flow, same as a staff-registered visit.
  const handleVerifyQr = async (visit) => {
    await updateDocument(`facilities/${facilityId}/opdVisits/${visit.id}`, {
      verified: true,
      status: 'checked_in',
      checkedInAt: Date.now(),
    }, {
      user: staffProfile?.name || user?.email,
      facilityId,
      audit: { action: 'qr_booking_verified', module: 'opd' },
    })
  }

  const handleNoShow = async (visit) => {
    await updateDocument(`facilities/${facilityId}/opdVisits/${visit.id}`, {
      status: 'no_show',
    }, {
      user: staffProfile?.name || user?.email,
      facilityId,
      audit: { action: 'patient_no_show', module: 'opd' },
    })
  }

  // Advances the lowest-token checked-in patient to in-progress — the button
  // a doctor's room presses instead of hunting the right card in the list.
  const handleCallNext = async () => {
    const next = byDoctor
      .filter((v) => v.status === 'checked_in')
      .sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0))[0]
    if (!next) return
    await updateDocument(`facilities/${facilityId}/opdVisits/${next.id}`, {
      status: 'in_progress',
      calledAt: Date.now(),
    }, {
      user: staffProfile?.name || user?.email,
      facilityId,
      audit: { action: 'patient_called', module: 'opd' },
    })
  }

  const handlePrintSlip = async (visit) => {
    const patient = visit.patientId
      ? await getDocument(`facilities/${facilityId}/patients/${visit.patientId}`)
      : null
    const pdf = await buildOpdSlipPDF({ facility: facilityConfig || {}, patient, visit })
    printPDF(pdf)
  }

  const statusCounts = {
    booked: filtered.filter((v) => v.status === 'booked').length,
    checked_in: filtered.filter((v) => v.status === 'checked_in').length,
    in_progress: filtered.filter((v) => v.status === 'in_progress').length,
    completed: filtered.filter((v) => v.status === 'completed').length,
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><ListOrdered size={22} /> OPD Queue — Today</h2>
          <p>{filtered.length} appointment{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <SelfCheckinQR facilityId={facilityId} facilityName={facilityConfig?.facilityName} />
          <button className="btn btn-primary" onClick={() => navigate('/opd/register')}>
            <UserPlus size={16} /> New Registration
          </button>
        </div>
      </div>

      <div className="queue-stats">
        <div className="queue-stat"><span className="queue-stat-num">{statusCounts.booked}</span><span>Booked</span></div>
        <div className="queue-stat queue-stat-warning"><span className="queue-stat-num">{statusCounts.checked_in}</span><span>Checked In</span></div>
        <div className="queue-stat queue-stat-active"><span className="queue-stat-num">{statusCounts.in_progress}</span><span>In Progress</span></div>
        <div className="queue-stat queue-stat-success"><span className="queue-stat-num">{statusCounts.completed}</span><span>Completed</span></div>
      </div>

      <div className="queue-filter">
        <label>Doctor:</label>
        <select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}>
          <option value="all">All Doctors</option>
          {staff.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button
          className="btn btn-outline btn-sm"
          onClick={handleCallNext}
          disabled={!byDoctor.some((v) => v.status === 'checked_in')}
        >
          Call Next
        </button>
      </div>

      {pendingQr.length > 0 && (
        <div className="queue-list queue-list-pending-qr">
          <h3 className="queue-section-title"><QrCode size={16} /> Pending QR Check-ins ({pendingQr.length})</h3>
          {pendingQr.map((visit) => (
            <div key={visit.id} className="queue-card queue-card-booked">
              <div className="queue-token">
                <span className="token-number">{visit.tokenNumber || '—'}</span>
              </div>
              <div className="queue-patient-info">
                <div className="queue-patient-name">{visit.patientName || 'Unknown'}</div>
                <div className="queue-patient-meta">
                  {visit.chiefComplaint && <span>{visit.chiefComplaint}</span>}
                </div>
                <div className="queue-doctor-name">Dr. {visit.doctorName || 'Unassigned'}{visit.departmentName ? ` — ${visit.departmentName}` : ''}</div>
              </div>
              <div className="queue-status">
                <span className="badge badge-muted"><QrCode size={12} /> awaiting check-in</span>
              </div>
              <div className="queue-actions">
                <button className="btn btn-primary btn-sm" onClick={() => handleVerifyQr(visit)}>Verify &amp; Check In</button>
                <button className="btn btn-outline btn-sm btn-danger" onClick={() => handleNoShow(visit)}>No Show</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="queue-list">
        {filtered.length === 0 ? (
          <div className="empty-state">No appointments for today.</div>
        ) : (
          filtered.map((visit) => {
            const Icon = STATUS_ICONS[visit.status] || Clock
            return (
              <div key={visit.id} className={`queue-card queue-card-${visit.status}`}>
                <div className="queue-token">
                  <span className="token-number">{visit.tokenNumber || '—'}</span>
                </div>
                <div className="queue-patient-info">
                  <div className="queue-patient-name">{visit.patientName || 'Unknown'}</div>
                  <div className="queue-patient-meta">
                    <span className="font-mono">{visit.patientUhid || ''}</span>
                    {visit.chiefComplaint && <span> — {visit.chiefComplaint}</span>}
                  </div>
                  <div className="queue-doctor-name">
                    {departmentSummary({
                      departmentName: visit.departmentName,
                      doctorName: visit.doctorName,
                      floor: visit.floor,
                      roomNumber: visit.roomNumber,
                    }) || `Dr. ${visit.doctorName || 'Unassigned'}`}
                  </div>
                </div>
                <div className="queue-status">
                  <span className={`badge badge-${visit.status === 'completed' ? 'success' : visit.status === 'checked_in' || visit.status === 'in_progress' ? 'warning' : visit.status === 'no_show' ? 'danger' : 'muted'}`}>
                    <Icon size={12} /> {visit.status?.replace('_', ' ')}
                  </span>
                </div>
                <div className="queue-actions">
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handlePrintSlip(visit)}
                    title="Print OPD slip"
                  >
                    <Printer size={14} /> Slip
                  </button>
                  {visit.status === 'booked' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => handleCheckIn(visit)}>Check In</button>
                      <button className="btn btn-outline btn-sm btn-danger" onClick={() => handleNoShow(visit)}>No Show</button>
                    </>
                  )}
                  {(visit.status === 'checked_in' || visit.status === 'in_progress') && (
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/opd/consultation/${visit.id}`)}>
                      Consult
                    </button>
                  )}
                  {visit.status === 'completed' && (
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/opd/consultation/${visit.id}`)}>
                      View
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
