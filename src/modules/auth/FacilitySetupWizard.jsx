import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { setDocument } from '@lib/db'
import {
  FACILITY_TYPES, FACILITY_TYPE_LABELS, FACILITY_TYPE_MODULES, INDIAN_STATES,
} from '@lib/constants'
import {
  Building2, MapPin, Phone, Mail, FileText,
  ChevronRight, ChevronLeft, Check, Activity,
} from 'lucide-react'

const STEPS = ['Facility Type', 'Details', 'Configuration', 'Review']

export default function FacilitySetupWizard() {
  const { user, setStaffProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    facilityType: '',
    facilityName: '',
    address: '',
    city: '',
    state: 'Uttar Pradesh',
    pincode: '',
    phone: '',
    email: user?.email || '',
    gstin: '',
    gstEnabled: false,
    bedCount: 0,
  })

  const update = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm({ ...form, [field]: val })
  }

  const modules = form.facilityType
    ? FACILITY_TYPE_MODULES[form.facilityType]
    : {}

  const canNext = () => {
    if (step === 0) return !!form.facilityType
    if (step === 1) return form.facilityName && form.phone && form.city && form.state
    return true
  }

  const handleFinish = async () => {
    setSaving(true)
    setError('')
    try {
      const facilityId = user.uid
      const now = Date.now()
      const facilityConfig = {
        facilityName: form.facilityName,
        facilityType: form.facilityType,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        phone: form.phone,
        email: form.email,
        gstin: form.gstin,
        gstEnabled: form.gstEnabled,
        bedCount: Number(form.bedCount) || 0,
        modules: { ...modules, billing: true },
        subscription: {
          plan: 'trial',
          status: 'trial',
          startDate: new Date().toISOString(),
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        uhidPrefix: 'PT',
        invoicePrefix: 'INV',
        createdAt: now,
      }

      await setDocument(`facilities/${facilityId}/staff/${user.uid}`, {
        name: user.displayName || form.facilityName,
        email: user.email,
        phone: form.phone,
        role: 'facility_admin',
        department: 'Administration',
        status: 'active',
        createdAt: now,
      })

      await setDocument(`facilities/${facilityId}/config`, facilityConfig)

      await setDocument(`facilityIndex/${facilityId}`, {
        facilityName: form.facilityName,
        facilityType: form.facilityType,
        city: form.city,
        state: form.state,
        phone: form.phone,
        email: form.email,
        ownerUid: user.uid,
        ownerName: user.displayName || form.facilityName,
        status: 'active',
        subscription: facilityConfig.subscription,
        createdAt: now,
      })

      localStorage.removeItem('hms-pending-facility-id')

      setStaffProfile({
        uid: user.uid,
        facilityId,
        role: 'facility_admin',
        name: user.displayName || form.facilityName,
        email: user.email,
      })

      navigate('/')
    } catch (err) {
      console.error('Setup failed:', err)
      setError('Failed to create facility. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="setup-card">
        <div className="auth-logo">
          <Activity size={36} />
          <h1>Setup Your Facility</h1>
        </div>

        <div className="setup-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`setup-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="step-number">{i < step ? <Check size={14} /> : i + 1}</div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="setup-body">
          {step === 0 && (
            <div className="facility-type-grid">
              {Object.entries(FACILITY_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  className={`facility-type-card ${form.facilityType === key ? 'selected' : ''}`}
                  onClick={() => setForm({ ...form, facilityType: key })}
                >
                  <Building2 size={28} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="setup-form">
              <div className="form-group">
                <label><Building2 size={16} /> Facility Name *</label>
                <input value={form.facilityName} onChange={update('facilityName')} placeholder="e.g. City Hospital" required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label><Phone size={16} /> Phone *</label>
                  <input value={form.phone} onChange={update('phone')} placeholder="Phone number" required />
                </div>
                <div className="form-group">
                  <label><Mail size={16} /> Email</label>
                  <input value={form.email} onChange={update('email')} placeholder="facility@email.com" />
                </div>
              </div>
              <div className="form-group">
                <label><MapPin size={16} /> Address</label>
                <textarea value={form.address} onChange={update('address')} placeholder="Full address" rows={2} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>City *</label>
                  <input value={form.city} onChange={update('city')} placeholder="City" required />
                </div>
                <div className="form-group">
                  <label>State *</label>
                  <select value={form.state} onChange={update('state')}>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>PIN Code</label>
                  <input value={form.pincode} onChange={update('pincode')} placeholder="201102" maxLength={6} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup-form">
              <div className="form-row">
                <div className="form-group">
                  <label><FileText size={16} /> GSTIN</label>
                  <input value={form.gstin} onChange={update('gstin')} placeholder="GST Number (optional)" />
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={form.gstEnabled} onChange={update('gstEnabled')} />
                    Enable GST on invoices
                  </label>
                </div>
              </div>
              {modules.ipd && (
                <div className="form-group">
                  <label>Bed Count</label>
                  <input type="number" value={form.bedCount} onChange={update('bedCount')} min={0} />
                </div>
              )}
              <div className="modules-preview">
                <h4>Modules enabled for {FACILITY_TYPE_LABELS[form.facilityType]}:</h4>
                <div className="module-tags">
                  {Object.entries(modules).filter(([, v]) => v).map(([mod]) => (
                    <span key={mod} className="module-tag">{mod.toUpperCase()}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-review">
              <div className="review-section">
                <h4>Facility</h4>
                <p><strong>{form.facilityName}</strong></p>
                <p>{FACILITY_TYPE_LABELS[form.facilityType]}</p>
                <p>{form.address}, {form.city}, {form.state} {form.pincode}</p>
                <p>{form.phone} | {form.email}</p>
                {form.gstin && <p>GSTIN: {form.gstin}</p>}
              </div>
              <div className="review-section">
                <h4>Active Modules</h4>
                <div className="module-tags">
                  {Object.entries(modules).filter(([, v]) => v).map(([mod]) => (
                    <span key={mod} className="module-tag">{mod.toUpperCase()}</span>
                  ))}
                  <span className="module-tag">BILLING</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="setup-actions">
          {step > 0 && (
            <button className="btn btn-outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} disabled={saving}>
              {saving ? 'Creating...' : 'Create Facility'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
