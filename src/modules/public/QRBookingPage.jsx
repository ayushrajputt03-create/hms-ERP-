import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicBookingInfo, bookOpdVisitPublic, bookingErrorMessage } from '@lib/publicBooking'
import { Activity, User, Phone, Stethoscope, CheckCircle2, Loader } from 'lucide-react'

// Public, no-login QR entry point — a patient scans a facility's poster and
// lands here on their own phone. No auth wall, no patient lookup: identity
// is only reconciled once reception verifies the token at the counter.
export default function QRBookingPage() {
  const { facilityId } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '', phone: '', age: '', gender: 'male', reason: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!facilityId) return
    getPublicBookingInfo(facilityId)
      .then(setInfo)
      .catch((err) => setLoadError(bookingErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [facilityId])

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Please enter the patient’s name.'); return }
    if (!/^[6-9]\d{9}$/.test(form.phone.trim().replace(/[\s-]/g, ''))) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const visit = await bookOpdVisitPublic({
        facilityId,
        patientName: form.name.trim(),
        patientPhone: form.phone.trim(),
        patientAge: form.age ? Number(form.age) : null,
        patientGender: form.gender,
        reason: form.reason.trim(),
      })
      setResult(visit)
    } catch (err) {
      setError(bookingErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card"><Loader size={24} className="spin" /></div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo"><Activity size={40} /></div>
          <div className="auth-error">{loadError}</div>
        </div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="auth-page">
        <div className="auth-card qr-booking-success">
          <CheckCircle2 size={48} className="text-success" />
          <h2>Booking Confirmed</h2>
          <div className="registration-token">
            <span className="registration-token-label">Your Token No.</span>
            <span className="registration-token-value">{result.tokenNumber}</span>
          </div>
          {/* No doctor to show yet — that is assigned at the counter. */}
          <p className="qr-booking-doctor">Department &amp; doctor will be assigned at reception</p>
          {typeof result.waitingAhead === 'number' && (
            <p className="qr-booking-wait">
              {result.waitingAhead > 0
                ? `${result.waitingAhead} patient${result.waitingAhead === 1 ? '' : 's'} ahead of you`
                : 'You are next in line'}
            </p>
          )}
          <p className="qr-booking-note">Please show this token number at the reception counter to check in.</p>
          <button className="btn btn-outline" onClick={() => { setResult(null); setForm({ name: '', phone: '', age: '', gender: 'male', reason: '' }) }}>
            Book Another Patient
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card qr-booking-card">
        <div className="auth-logo">
          <Activity size={40} />
          <h1>{info?.name || 'OPD Self Check-In'}</h1>
          {info?.address && <p>{info.address}</p>}
        </div>

        <form onSubmit={handleSubmit} className="auth-form qr-booking-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label><User size={16} /> Patient Name *</label>
            <input value={form.name} onChange={update('name')} placeholder="Full name" autoComplete="name" />
          </div>

          <div className="form-group">
            <label><Phone size={16} /> Mobile Number *</label>
            <input
              value={form.phone}
              onChange={update('phone')}
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile number"
              autoComplete="tel"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Age</label>
              <input value={form.age} onChange={update('age')} type="number" min="0" max="120" placeholder="Years" inputMode="numeric" />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={form.gender} onChange={update('gender')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* The doctor dropdown that used to sit here has been removed. A
              patient cannot see who is on leave, who is already overbooked or
              which department their complaint belongs to, so choosing a
              consultant was never really theirs to make. Reception assigns
              department and doctor when this token is presented. */}
          <div className="form-group">
            <label><Stethoscope size={16} /> Reason for Visit (optional)</label>
            <input value={form.reason} onChange={update('reason')} placeholder="e.g. fever, follow-up" />
            <p className="field-hint">
              Reception will assign your department and doctor when you check in.
            </p>
          </div>

          {info?.accepting === false && (
            <p className="field-hint">
              This hospital is not taking online tokens right now. Please visit the reception desk.
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting || info?.accepting === false}>
            {submitting ? 'Booking...' : 'Get My Token'}
          </button>
        </form>
      </div>
    </div>
  )
}
