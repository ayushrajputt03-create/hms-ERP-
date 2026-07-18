import { useState, useEffect } from 'react'
import { onAuthChange, signInWithEmail, signOut, readableAuthError } from '@lib/auth'
import { queryDocuments } from '@lib/db'
import { formatDate, formatINR } from '@lib/utils'
import { FACILITY_TYPE_LABELS } from '@lib/constants'
import DataTable from '@components/DataTable'
import StatCard from '@components/StatCard'
import LoadingScreen from '@components/LoadingScreen'
import {
  Activity, Building2, Users, CreditCard, LogOut,
  LayoutDashboard, List, BarChart3, Lock, Mail,
} from 'lucide-react'
import './super-admin.css'

const OWNER_EMAIL = import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'ayushrajputt03@gmail.com'

export default function SuperAdminApp() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [facilities, setFacilities] = useState([])
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    return onAuthChange((u) => {
      if (u && u.email === OWNER_EMAIL) {
        setUser(u)
        loadFacilities(u)
      } else {
        setUser(null)
        setFacilities([])
      }
      setLoading(false)
    })
  }, [])

  const loadFacilities = async () => {
    try {
      const data = await queryDocuments('facilityIndex')
      setFacilities(data)
    } catch (err) {
      console.error('Failed to load facilities:', err)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const cred = await signInWithEmail(loginForm.email, loginForm.password)
      if (cred.user.email !== OWNER_EMAIL) {
        await signOut()
        setLoginError('Not authorized as super admin.')
      }
    } catch (err) {
      setLoginError(readableAuthError(err.code || err.message))
    } finally {
      setLoginLoading(false)
    }
  }

  if (loading) return <LoadingScreen message="Loading Super Admin..." />

  if (!user) {
    return (
      <div className="sa-login-page">
        <div className="sa-login-card">
          <div className="sa-login-logo">
            <Lock size={36} />
            <h1>Super Admin</h1>
            <p>HMS ERP Platform Console</p>
          </div>
          <form onSubmit={handleLogin}>
            {loginError && <div className="auth-error">{loginError}</div>}
            <div className="form-group">
              <label><Mail size={16} /> Email</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label><Lock size={16} /> Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loginLoading}>
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const activeFacilities = facilities.filter((f) => f.status === 'active')
  const trialFacilities = facilities.filter((f) => f.subscription?.status === 'trial')

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'facilities', label: 'Facilities', icon: Building2 },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ]

  const screens = {
    dashboard: (
      <div>
        <h2>Platform Overview</h2>
        <div className="stats-grid">
          <StatCard icon={Building2} label="Total Facilities" value={facilities.length} color="teal" />
          <StatCard icon={Users} label="Active" value={activeFacilities.length} color="green" />
          <StatCard icon={CreditCard} label="On Trial" value={trialFacilities.length} color="amber" />
        </div>
      </div>
    ),
    facilities: (
      <div>
        <h2>All Facilities</h2>
        <DataTable
          columns={[
            { header: 'Name', accessor: 'facilityName' },
            { header: 'Type', accessor: 'facilityType', cell: (r) => FACILITY_TYPE_LABELS[r.facilityType] || r.facilityType },
            { header: 'City', accessor: 'city' },
            { header: 'Owner', accessor: 'ownerName' },
            { header: 'Status', accessor: 'status', cell: (r) => (
              <span className={`badge badge-${r.status === 'active' ? 'success' : 'muted'}`}>{r.status}</span>
            )},
            { header: 'Plan', cell: (r) => r.subscription?.plan || '—' },
          ]}
          data={facilities}
          searchPlaceholder="Search facilities..."
        />
      </div>
    ),
    analytics: (
      <div>
        <h2>Analytics</h2>
        <div className="empty-state">
          <p>Analytics will be available once facilities generate data.</p>
        </div>
      </div>
    ),
  }

  return (
    <div className="sa-shell">
      <aside className="sa-sidebar">
        <div className="sa-brand">
          <Activity size={24} />
          <span>HMS Admin</span>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`sa-nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <button className="sa-nav-item sa-logout" onClick={signOut}>
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </aside>
      <main className="sa-main">
        {screens[page]}
      </main>
    </div>
  )
}
