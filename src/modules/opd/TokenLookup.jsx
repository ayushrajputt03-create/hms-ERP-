import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFacility } from '@hooks/useFacility'
import { getVisitByToken } from '@lib/opd'
import { formatAgeSex, formatGuardian } from '@lib/patients'
import { formatDate } from '@lib/utils'
import { buildOpdSlipPDF, printPDF } from '@lib/pdf'
import { Hash, Search, Printer, Stethoscope, Loader, ShieldAlert, CheckCircle } from 'lucide-react'

const todayLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

// Counter-facing token lookup: the patient walks up holding a slip (or a QR
// self-booking confirmation on their phone) and reads out a number.
//
// The RPC returns every visit holding that number on that day, because tokens
// are numbered per department (staff desk) and per doctor (QR kiosk) — not
// hospital-wide. Showing all matches and letting the clerk pick is the only
// safe behaviour; auto-selecting the first would eventually pull up the wrong
// patient on a busy morning.
export default function TokenLookup() {
  const navigate = useNavigate()
  const { facilityConfig } = useFacility()
  const [token, setToken] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [matches, setMatches] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async (e) => {
    e?.preventDefault()
    const n = Number(token)
    if (!token.trim() || !Number.isFinite(n) || n <= 0) {
      setError('Enter the token number printed on the slip.')
      setMatches(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await getVisitByToken({ tokenNumber: n, tokenDate: date })
      setMatches(res?.matches || [])
    } catch (err) {
      console.error('Token lookup error:', err)
      setError('Could not look up that token. Please try again.')
      setMatches(null)
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

  return (
    <div className="patient-form-card token-lookup" style={{ maxWidth: 820 }}>
      <form className="form-row token-lookup-form" onSubmit={handleSearch}>
        <div className="form-group" style={{ flex: 1 }}>
          <label><Hash size={14} /> Token Number</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 42"
            autoFocus
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
        <div className="empty-state">
          <p>No visit found for token {token} on {formatDate(new Date(date).getTime(), 'date')}.</p>
        </div>
      )}

      {matches?.length > 1 && (
        <div className="token-lookup-ambiguous">
          <ShieldAlert size={15} />
          <span>
            {matches.length} visits share token {token} on this date — tokens are numbered
            per department/doctor. Confirm the department before proceeding.
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
                  {v.verified ? <><CheckCircle size={11} /> QR · verified</> : 'QR self-booked · unverified'}
                </span>
              )}
            </div>
          </div>

          <div className="registration-summary">
            <div><span>Patient</span><strong>{v.patient?.name || '—'}</strong></div>
            <div><span>UHID</span><strong className="font-mono">{v.patient?.uhid || '—'}</strong></div>
            <div><span>Age / Sex</span><strong>{v.patient ? formatAgeSex(v.patient) : '—'}</strong></div>
            <div><span>Guardian</span><strong>{v.patient ? (formatGuardian(v.patient) || '—') : '—'}</strong></div>
            <div><span>Phone</span><strong>{v.patient?.phone || '—'}</strong></div>
            <div><span>Dept. Reg. No.</span><strong className="font-mono">{v.deptRegNo || '—'}</strong></div>
            <div><span>Department</span><strong>{v.departmentName || '—'}</strong></div>
            <div><span>Doctor</span><strong>{v.doctorName ? `Dr. ${v.doctorName}` : '—'}</strong></div>
            <div><span>Registered</span><strong>{formatDate(v.visitDate, 'datetime')}</strong></div>
            <div><span>Fee</span><strong>Rs. {v.feeAmount ?? 0}</strong></div>
          </div>

          {v.chiefComplaint && (
            <p className="visit-complaint"><strong>Complaint:</strong> {v.chiefComplaint}</p>
          )}

          <div className="form-actions">
            {v.patientId && (
              <button className="btn btn-outline" onClick={() => navigate(`/patients/${v.patientId}`)}>
                View Patient
              </button>
            )}
            <button className="btn btn-outline" onClick={() => navigate(`/opd/consultation/${v.id}`)}>
              <Stethoscope size={14} /> Open Consultation
            </button>
            <button className="btn btn-primary" onClick={() => handlePrint(v)}>
              <Printer size={14} /> Print Parchi
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
