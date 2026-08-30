import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signUpWithEmail, readableAuthError, PENDING_SETUP_KEY, clearFlag } from '@lib/auth'
import { setDocument } from '@lib/db'
import { useAuth } from '@hooks/useAuth'
import { FACILITY_TYPE_MODULES } from '@lib/constants'
import { Activity, Mail, Lock, User, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setStaffProfile } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', facilityType: 'solo_clinic' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      const { user: newUser } = await signUpWithEmail(form.email, form.password, form.name)
      
      // Auto-create facility directly to bypass the setup wizard
      const facilityId = newUser.uid
      const now = Date.now()
      const facilityType = form.facilityType || 'solo_clinic'
      const facilityName = `${form.name}'s ${facilityType === 'solo_clinic' ? 'Clinic' : 'Hospital'}`
      
      const defaultModules = FACILITY_TYPE_MODULES[facilityType] || {}
      
      const facilityConfig = {
        facilityName,
        facilityType,
        address: '',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '9999999999',
        email: form.email,
        gstin: '',
        gstEnabled: false,
        bedCount: facilityType === 'solo_clinic' ? 0 : 50,
        modules: { ...defaultModules, billing: true },
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

      // Write facility docs directly
      await setDocument(`facilities/${facilityId}/staff/${newUser.uid}`, {
        name: form.name,
        email: form.email,
        phone: '9999999999',
        role: 'facility_admin',
        department: 'Administration',
        status: 'active',
        createdAt: now,
      })

      await setDocument(`facilities/${facilityId}/config`, facilityConfig)

      await setDocument(`facilityIndex/${facilityId}`, {
        facilityName,
        facilityType,
        city: 'Delhi',
        state: 'Delhi',
        phone: '9999999999',
        email: form.email,
        ownerUid: newUser.uid,
        ownerName: form.name,
        status: 'active',
        subscription: facilityConfig.subscription,
        createdAt: now,
      })
      
      clearFlag(PENDING_SETUP_KEY)
      
      setStaffProfile({
        uid: newUser.uid,
        facilityId,
        role: 'facility_admin',
        name: form.name,
        email: form.email,
      })

      navigate('/')
    } catch (err) {
      console.error('Register error:', err, 'code:', err.code, 'message:', err.message)
      setError(readableAuthError(err.code || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Activity size={40} />
          <h1>HMS ERP</h1>
          <p>Create your facility account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2>Register</h2>

          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label><User size={16} /> Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={update('name')}
              placeholder="Your full name"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label><Mail size={16} /> Email</label>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="your@email.com"
              required
            />
          </div>

          <div className="form-group">
            <label><Lock size={16} /> Password</label>
            <div className="input-with-icon">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={update('password')}
                placeholder="Min 6 characters"
                required
              />
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label><Lock size={16} /> Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={update('confirmPassword')}
              placeholder="Repeat password"
              required
            />
          </div>

          <div className="form-group">
            <label><Activity size={16} /> Facility Type / Plan</label>
            <select
              value={form.facilityType}
              onChange={update('facilityType')}
              required
              className="select-facility-type"
            >
              <option value="solo_clinic">Solo Clinic / Small OPD</option>
              <option value="multi_specialty">Multi-Specialty Hospital</option>
              <option value="nursing_home">Nursing Home</option>
              <option value="diagnostic_lab">Diagnostic / Pathology Lab</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account & Setup Facility'}
          </button>

          <div className="auth-links">
            <Link to="/login">Already have an account? Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
