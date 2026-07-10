import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resetPassword, readableAuthError } from '@lib/auth'
import { Activity, Mail } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      setError(readableAuthError(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Activity size={40} />
          <h1>Reset Password</h1>
        </div>

        {sent ? (
          <div className="auth-form">
            <div className="auth-success">
              Password reset email sent to <strong>{email}</strong>. Check your inbox.
            </div>
            <Link to="/login" className="btn btn-primary btn-block">Back to Sign In</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label><Mail size={16} /> Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="auth-links">
              <Link to="/login">Back to Sign In</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
