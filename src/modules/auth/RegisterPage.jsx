import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signUpWithEmail, readableAuthError } from '@lib/auth'
import { Activity, Mail, Lock, User, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
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
      await signUpWithEmail(form.email, form.password, form.name)
      localStorage.setItem('hms-pending-facility-id', 'setup')
      navigate('/setup')
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

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <div className="auth-links">
            <Link to="/login">Already have an account? Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
