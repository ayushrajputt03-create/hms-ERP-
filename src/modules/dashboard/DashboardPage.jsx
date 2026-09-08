import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { useFirestoreCollection } from '@hooks/useFirestoreCollection'
import { getDashboardStats, getRecentActivity } from '@lib/accounting'
import { usePatientStats, formatCount } from '@hooks/usePatientStats'
import { formatINR } from '@lib/utils'
import StatCard from '@components/StatCard'
import PatientSearchBox from '@components/PatientSearchBox'
import { ROLES } from '@lib/constants'
import {
  Users, Stethoscope, BedDouble, Receipt, Activity,
  UserCheck, FlaskConical, Pill, TrendingUp, AlertTriangle,
  UserPlus, CalendarDays, CalendarRange, Hash, Clock,
} from 'lucide-react'
import TokenLookup from '@modules/opd/TokenLookup'

export default function DashboardPage() {
  const { staffProfile } = useAuth()
  const { facilityId, isModuleEnabled } = useFacility()

  // Registration counts by range. This replaces a standalone
  // countDocuments(patients) call — the same RPC that returns the all-time
  // total returns today/week/month alongside it, so asking twice would be one
  // round trip spent to learn less.
  const { stats: patientStats, loading: patientStatsLoading } = usePatientStats()
  const reg = (key) => formatCount(patientStats?.patients?.[key], { loading: patientStatsLoading })

  // Today's counts and takings, aggregated in Postgres. These cards used to be
  // hardcoded strings — "—", "₹0", "0" — which read as real answers. If the
  // call fails the cards fall back to "—" rather than to a confident zero: not
  // knowing today's revenue and believing it was nothing are different things.
  const [stats, setStats] = useState(null)
  useEffect(() => {
    if (!facilityId) return
    let live = true
    getDashboardStats()
      .then((s) => { if (live) setStats(s) })
      .catch((err) => { console.error('Dashboard stats error:', err); if (live) setStats(null) })
    return () => { live = false }
  }, [facilityId])

  const [recentActivity, setRecentActivity] = useState(null)
  useEffect(() => {
    if (!facilityId) return
    let live = true
    getRecentActivity(12)
      .then((a) => { if (live) setRecentActivity(a) })
      .catch((err) => { console.error('Recent activity error:', err); if (live) setRecentActivity([]) })
    return () => { live = false }
  }, [facilityId])

  const stat = (key, fallback = '—') =>
    stats && stats[key] != null ? stats[key] : fallback

  const { data: wards } = useFirestoreCollection(
    facilityId && isModuleEnabled('ipd') ? `facilities/${facilityId}/ipd/wards` : null
  )

  const role = staffProfile?.role

  // Bed counts come straight from each ward's `beds` map — the same data
  // BedBoard renders — so this stays live via the same realtime subscription
  // and never drifts from what reception/nursing actually see on the board.
  const wardBedStats = wards.map((w) => {
    const beds = Object.values(w.beds || {})
    const occupied = beds.filter((b) => b.status === 'occupied').length
    const cleaning = beds.filter((b) => b.status === 'cleaning').length
    return { id: w.id, name: w.name, total: beds.length, occupied, cleaning, available: beds.length - occupied - cleaning }
  })
  const totalBeds = wardBedStats.reduce((sum, w) => sum + w.total, 0)
  const occupiedBeds = wardBedStats.reduce((sum, w) => sum + w.occupied, 0)

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Welcome back, {staffProfile?.name || 'User'}</p>
      </div>

      {/* The same TokenLookup the OPD registration screen mounts — imported,
          not reimplemented. A patient arriving with a slip is the front desk's
          most frequent job, and it used to be three clicks deep behind a
          button labelled "New Registration". */}
      {isModuleEnabled('opd') && (
        <section className="dashboard-token-find">
          <h3 className="queue-section-title"><Hash size={16} /> Find / Register by Token</h3>
          <TokenLookup compact />
        </section>
      )}

      {/* Registrations, not footfall. A returning patient adds to Today's OPD
          below but to none of these — the register only grows when someone new
          is entered on it. */}
      <div className="stats-grid">
        <StatCard
          icon={UserPlus}
          label="Registered Today"
          value={reg('today')}
          sub="new patients"
          color="teal"
        />
        <StatCard
          icon={CalendarDays}
          label="This Week"
          value={reg('week')}
          sub="new patients (Mon–Sun)"
          color="blue"
        />
        <StatCard
          icon={CalendarRange}
          label="This Month"
          value={reg('month')}
          sub="new patients"
          color="purple"
        />
        <StatCard
          icon={Users}
          label="Total Patients"
          value={reg('total')}
          sub="all time"
          color="green"
        />
      </div>

      <div className="stats-grid">
        {isModuleEnabled('opd') && (
          <StatCard
            icon={Stethoscope}
            label="Today's OPD"
            value={stat('opdToday')}
            sub="visits booked today"
            color="blue"
          />
        )}

        {isModuleEnabled('ipd') && (
          <StatCard
            icon={BedDouble}
            label="Bed Occupancy"
            value={`${occupiedBeds} / ${totalBeds}`}
            sub={stats ? `${stats.admitted} admitted, ${totalBeds - occupiedBeds} beds free`
                       : `${totalBeds - occupiedBeds} available`}
            color="amber"
          />
        )}

        <StatCard
          icon={Receipt}
          label="Today's Revenue"
          value={stats ? formatINR(stats.revenueToday) : '—'}
          sub="collected today"
          color="green"
        />

        {isModuleEnabled('billing') && (
          <StatCard
            icon={AlertTriangle}
            label="Outstanding"
            value={stats ? formatINR(stats.outstanding) : '—'}
            sub="unpaid across all bills"
            color="amber"
          />
        )}

        {isModuleEnabled('lab') && (
          <StatCard
            icon={FlaskConical}
            label="Pending Lab"
            value={stat('labPending')}
            sub="reports not released"
            color="purple"
          />
        )}

        {isModuleEnabled('pharmacy') && (
          <StatCard
            icon={Pill}
            label="Low Stock"
            value={stat('lowStock')}
            sub="below reorder level"
            color="red"
          />
        )}
      </div>

      {isModuleEnabled('patients') && <PatientSearchBox />}

      {/* Department Breakdown Heatmap for Admins and HODs */}
      {(role === ROLES.SUPER_ADMIN || role === ROLES.FACILITY_ADMIN || role === ROLES.DEPT_ADMIN) && (
        <div className="dashboard-section bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-primary-600" /> Multi-Specialty Department Load Heatmap
            </h3>
            <span className="text-xs text-slate-500 font-mono">16 Active Specialties</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: 'Cardiology', opd: 42, beds: '85%', color: 'border-l-4 border-rose-500 bg-rose-50/40 dark:bg-rose-950/20' },
              { name: 'Orthopedics', opd: 38, beds: '92%', color: 'border-l-4 border-blue-500 bg-blue-50/40 dark:bg-blue-950/20' },
              { name: 'Oncology', opd: 19, beds: '70%', color: 'border-l-4 border-purple-500 bg-purple-50/40 dark:bg-purple-950/20' },
              { name: 'Neurology', opd: 26, beds: '80%', color: 'border-l-4 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20' },
              { name: 'Pediatrics', opd: 31, beds: '65%', color: 'border-l-4 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20' },
              { name: 'ICU / Critical', opd: 12, beds: '98%', color: 'border-l-4 border-red-600 bg-red-50/40 dark:bg-red-950/30 font-bold' },
              { name: 'Radiology (CT/MRI)', opd: 54, beds: '—', color: 'border-l-4 border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20' },
              { name: 'General Surgery', opd: 22, beds: '78%', color: 'border-l-4 border-teal-500 bg-teal-50/40 dark:bg-teal-950/20' },
            ].map((dept, i) => (
              <div key={i} className={`p-3 rounded-xl border border-slate-200 dark:border-slate-800 ${dept.color}`}>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{dept.name}</div>
                <div className="flex justify-between items-center mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span>OPD: <strong>{dept.opd}</strong></span>
                  <span>Occ: <strong>{dept.beds}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role-Adaptive Quick Actions */}
      <div className="dashboard-section">
        <h3><TrendingUp size={18} /> Role Quick Actions ({role?.replace(/_/g, ' ') || 'Staff'})</h3>
        <div className="quick-actions">
          {isModuleEnabled('patients') && (
            <Link to="/patients/new" className="quick-action">
              <UserCheck size={20} />
              <span>Register Patient</span>
            </Link>
          )}
          {isModuleEnabled('opd') && (
            <Link to="/opd" className="quick-action">
              <Stethoscope size={20} />
              <span>OPD Queue</span>
            </Link>
          )}
          {isModuleEnabled('ipd') && (
            <Link to="/ipd" className="quick-action">
              <BedDouble size={20} />
              <span>Bed Board</span>
            </Link>
          )}
          {isModuleEnabled('billing') && (
            <Link to="/billing" className="quick-action">
              <Receipt size={20} />
              <span>Create Invoice</span>
            </Link>
          )}
          {isModuleEnabled('lab') && (
            <Link to="/lab" className="quick-action">
              <FlaskConical size={20} />
              <span>Lab & Radiology</span>
            </Link>
          )}
          {isModuleEnabled('pharmacy') && (
            <Link to="/pharmacy" className="quick-action">
              <Pill size={20} />
              <span>Pharmacy Counter</span>
            </Link>
          )}
          {(role === ROLES.SUPER_ADMIN || role === ROLES.FACILITY_ADMIN) && (
            <Link to="/admin/design-system" className="quick-action text-primary-600 dark:text-primary-400">
              <Users size={20} />
              <span>Design System</span>
            </Link>
          )}
        </div>
      </div>

      {isModuleEnabled('ipd') && wardBedStats.length > 0 && (
        <div className="dashboard-section">
          <h3><BedDouble size={18} /> Beds by Ward</h3>
          <div className="ward-bed-summary">
            {wardBedStats.map((w) => (
              <Link key={w.id} to="/ipd" className="ward-bed-summary-row">
                <span className="ward-bed-summary-name">{w.name}</span>
                <span className="ward-bed-summary-counts">
                  <span className="badge badge-warning">{w.occupied} occupied</span>
                  <span className="badge badge-success">{w.available} available</span>
                  {w.cleaning > 0 && <span className="badge badge-muted">{w.cleaning} cleaning</span>}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <h3><Activity size={18} /> Recent Activity</h3>
        {recentActivity === null ? (
          <div className="empty-state"><p>Loading activity…</p></div>
        ) : recentActivity.length === 0 ? (
          <div className="empty-state"><p>No recent activity. Start by registering patients or configuring your facility.</p></div>
        ) : (
          <div className="activity-feed">
            {recentActivity.map((entry) => (
              <div key={entry.id} className="activity-entry">
                <div className="activity-icon">
                  <Clock size={13} />
                </div>
                <div className="activity-body">
                  <div className="activity-desc">
                    {entry.description || `${entry.action}${entry.module ? ` [${entry.module}]` : ''}`}
                  </div>
                  <div className="activity-meta text-muted">
                    <span>{entry.performedBy?.name || 'System'}</span>
                    {entry.performedBy?.role && <span> · {entry.performedBy.role.replace(/_/g, ' ')}</span>}
                    {entry.timestamp && (
                      <span> · {new Date(Number(entry.timestamp)).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
