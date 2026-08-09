import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import { getVisitByToken, assignQrVisit } from '@lib/opd'
import { formatAgeSex, formatGuardian } from '@lib/patients'
import { formatDate } from '@lib/utils'
import { buildOpdSlipPDF, printPDF } from '@lib/pdf'
import AssignVisitModal from './AssignVisitModal'
import {
  Hash, Search, Printer, Stethoscope, Loader, ShieldAlert, CheckCircle, UserPlus,
} from 'lucide-react'

const todayLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

// Counter-facing token lookup: the patient walks up holding a slip (or a QR
// self-booking confirmation on their phone) and reads out a number.
//
// Tokens are now one series per facility per day, so a number resolves to
// exactly one visit. Several matches used to be normal — two parallel counter
// series were issuing the same numbers — and the code below still renders a
// list rather than a single record, because that duplication exists in the
// historical data and a lookup of an old date must still show it rather than
// silently pick one.
//
// Mounted both on the OPD registration screen and on the dashboard. Nothing
// here is dashboard-specific: the desk that most often needs this is the one
// that has the dashboard open all day.
export default function TokenLookup({ compact = false }) {
  const navigate = useNavigate()
  const { facilityId, facilityConfig } = useFacility()
  const [token, setToken] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assigning, setAssigning] = useState(null)
  const [departments, setDepartments] = useState([])
  const [doctors, setDoctors] = useState([])

  // Only needed for the assignment modal, which most lookups never open. Kept
  // as a plain subscription rather than a lazy fetch because both collections
  // are small and the queue screen already holds them anyway.
  useEffect(() => {
    if (!facilityId) return undefined
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/departments`, setDepartments),
      subscribeToCollection(`facilities/${facilityId}/staff`, (data) =>
        setDoctors(data.filter((s) => s.role === 'doctor' && s.status === 'active'))),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const handleSearch = async (e) => {
    e?.preventDefault()
    const n = Number(token)
    if (!token.trim() || !Number.isInteger(n) || n <= 0) {
      setError('Enter the token number printed on the slip.')
      setResult(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      setResult(await getVisitByToken({ tokenNumber: n, tokenDate: date }))
    } catch (err) {
      console.error('Token lookup error:', err)
      setError('Could not look up that token. Please try again.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = async (visit) => {
    try {
      const pdf = await buildOpdSlipPDF({
        facility: facilityConfig || {},
        patient: visit.patient || {},
        visit,
      })
      printPDF(pdf)
    } catch (err) {
      console.error('Slip print error:', err)
      setError('Failed to prepare the slip for printing.')
    }
  }

  const handleAssign = async ({ departmentId, doctorId }) => {
    await assignQrVisit({ visitId: assigning.id, departmentId, doctorId })
    setAssigning(null)
    await handleSearch()
  }

  const matches = result?.matches || null
  const searchedNumber = result?.tokenNumber
  const issuedUpTo = result?.issuedUpTo ?? 0
  // Distinguishable only because token issue is a single series now: a number
  // above everything issued today was never handed to anybody, whereas one
  // inside the range with no visit behind it is a cancelled or deleted record.
  const neverIssued = matches?.length === 0 && searchedNumber > issuedUpTo

  return (
    <div className={`patient-form-card token-lookup${compact ? ' token-lookup-compact' : ''}`}
         style={compact ? undefined : { maxWidth: 820 }}>
      {assigning && (
        <AssignVisitModal
          visit={assigning}
          departments={departments}
          doctors={doctors}
          onAssign={handleAssign}
          onClose={() => setAssigning(null)}
        />
      )}

      <form className="form-row token-lookup-form" onSubmit={handleSearch}>
        <div className="form-group" style={{ flex: 1 }}>
          <label><Hash size={14} /> Token Number</label>
          {/* type="number" would let the browser accept "1e3" and scroll-wheel
              the value while the clerk is reading a slip aloud. */}
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 42"
            autoFocus={!compact}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Token Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <Loader size={14} className="spin" /> : <Search size={14} />} Find
          </button>
        </div>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {matches?.length === 0 && (
        <div className="empty-state token-lookup-miss">
          <p>
            {neverIssued ? (
              <>
                Token {searchedNumber} has not been issued for{' '}
                {formatDate(new Date(date).getTime(), 'date')}.{' '}
                {issuedUpTo > 0
                  ? `Tokens up to ${issuedUpTo} have been given out today.`
                  : 'No tokens have been given out on this date yet.'}
              </>
            ) : (
              <>
                Token {searchedNumber} was issued on{' '}
                {formatDate(new Date(date).getTime(), 'date')} but has no visit on
                record. It may have been cancelled.
              </>
            )}
          </p>
          {/* The desk's next move either way: the patient is standing there
              without a usable token. */}
          <button className="btn btn-primary" onClick={() => navigate('/opd/register')}>
            <UserPlus size={14} /> Register This Patient
          </button>
        </div>
      )}

      {matches?.length > 1 && (
        <div className="token-lookup-ambiguous">
          <ShieldAlert size={15} />
          <span>
            {matches.length} visits share token {searchedNumber} on this date. Tokens
            were numbered per department before the series was unified, so this can
            only happen on historical dates — confirm the department before proceeding.
          </span>
        </div>
      )}

      {matches?.map((v) => (
        <div key={v.id} className="token-lookup-result">
          <div className="token-lookup-head">
            <span className="registration-token-value">#{v.tokenNumber}</span>
            <div className="token-lookup-badges">
              <span className={`badge badge-${v.status === 'completed' ? 'success' : v.status === 'in_progress' ? 'warning' : 'muted'}`}>
                {v.status}
              </span>
              {v.bookingSource === 'qr_self' && (
                <span className={`badge badge-${v.verified ? 'success' : 'warning'}`}>
                  {v.verified ? <><CheckCircle size={11} /> QR · verified</> : 'QR self-booked · not yet assigned'}
                </span>
              )}
            </div>
          </div>

          {/* A self-booked token that has not been routed yet is the real
              "token exists but the visit is not registered" case in this
              system — tokens are created BY registration at the counter, so a
              staff-issued number cannot exist without a visit behind it. */}
          {v.needsAssignment && (
            <div className="token-lookup-ambiguous">
              <ShieldAlert size={15} />
              <span>
                Self-booked online. Department and doctor have not been assigned yet —
                complete this before sending the patient in.
              </span>
            </div>
          )}

          <div className="registration-summary">
            <div><span>Patient</span><strong>{v.patient?.name || '—'}</strong></div>
            <div><span>UHID</span><strong className="font-mono">{v.patient?.uhid || '—'}</strong></div>
            <div><span>Age / Sex</span><strong>{v.patient ? formatAgeSex(v.patient) : '—'}</strong></div>
            <div><span>Guardian</span><strong>{v.patient ? (formatGuardian(v.patient) || '—') : '—'}</strong></div>
            <div><span>Phone</span><strong>{v.patient?.phone || '—'}</strong></div>
            <div><span>Dept. Reg. No.</span><strong className="font-mono">{v.deptRegNo || '—'}</strong></div>
            <div><span>Department</span><strong>{v.departmentName || 'Not assigned'}</strong></div>
            <div><span>Doctor</span><strong>{v.doctorName ? `Dr. ${v.doctorName}` : 'Not assigned'}</strong></div>
            <div><span>Room</span><strong>{v.roomNumber || 'Not assigned'}</strong></div>
            <div><span>Registered</span><strong>{formatDate(v.visitDate, 'datetime')}</strong></div>
            <div><span>Fee</span><strong>Rs. {v.feeAmount ?? 0}</strong></div>
          </div>

          {v.chiefComplaint && (
            <p className="visit-complaint"><strong>Complaint:</strong> {v.chiefComplaint}</p>
          )}

          <div className="form-actions">
            {v.needsAssignment && (
              <button className="btn btn-primary" onClick={() => setAssigning(v)}>
                <UserPlus size={14} /> Assign &amp; Check In
              </button>
            )}
            {v.patientId && (
              <button className="btn btn-outline" onClick={() => navigate(`/patients/${v.patientId}`)}>
                View Patient
              </button>
            )}
            {/* Hidden until routed: a consultation with no doctor has nowhere
                to file its notes. */}
            {!v.needsAssignment && (
              <button className="btn btn-outline" onClick={() => navigate(`/opd/consultation/${v.id}`)}>
                <Stethoscope size={14} /> Open Consultation
              </button>
            )}
            <button className="btn btn-outline" onClick={() => handlePrint(v)}>
              <Printer size={14} /> Print Parchi
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
