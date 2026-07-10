import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { useFirestoreCollection } from '@hooks/useFirestoreCollection'
import StatCard from '@components/StatCard'
import { ROLES } from '@lib/constants'
import {
  Users, Stethoscope, BedDouble, Receipt, Activity,
  UserCheck, FlaskConical, Pill, TrendingUp,
} from 'lucide-react'

export default function DashboardPage() {
  const { staffProfile } = useAuth()
  const { facilityId, facilityConfig, isModuleEnabled } = useFacility()

  const { data: patients } = useFirestoreCollection(
    facilityId ? `facilities/${facilityId}/patients` : null
  )

  const role = staffProfile?.role

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Welcome back, {staffProfile?.name || 'User'}</p>
      </div>

      <div className="stats-grid">
        <StatCard
          icon={Users}
          label="Total Patients"
          value={patients?.length || 0}
          color="teal"
        />

        {isModuleEnabled('opd') && (
          <StatCard
            icon={Stethoscope}
            label="Today's OPD"
            value="—"
            sub="Setup OPD to track"
            color="blue"
          />
        )}

        {isModuleEnabled('ipd') && (
          <StatCard
            icon={BedDouble}
            label="Bed Occupancy"
            value={`0 / ${facilityConfig?.bedCount || 0}`}
            sub="beds occupied"
            color="amber"
          />
        )}

        <StatCard
          icon={Receipt}
          label="Today's Revenue"
          value="₹0"
          sub="No transactions yet"
          color="green"
        />

        {isModuleEnabled('lab') && (
          <StatCard
            icon={FlaskConical}
            label="Pending Lab"
            value="0"
            sub="reports pending"
            color="purple"
          />
        )}

        {isModuleEnabled('pharmacy') && (
          <StatCard
            icon={Pill}
            label="Low Stock"
            value="0"
            sub="medicines"
            color="red"
          />
        )}
      </div>

      {(role === ROLES.FACILITY_ADMIN || role === ROLES.SUPER_ADMIN) && (
        <div className="dashboard-section">
          <h3><TrendingUp size={18} /> Quick Actions</h3>
          <div className="quick-actions">
            {isModuleEnabled('patients') && (
              <a href="/patients" className="quick-action">
                <UserCheck size={20} />
                <span>Register Patient</span>
              </a>
            )}
            {isModuleEnabled('opd') && (
              <a href="/opd" className="quick-action">
                <Stethoscope size={20} />
                <span>OPD Queue</span>
              </a>
            )}
            {isModuleEnabled('billing') && (
              <a href="/billing" className="quick-action">
                <Receipt size={20} />
                <span>Create Invoice</span>
              </a>
            )}
            <a href="/staff" className="quick-action">
              <Users size={20} />
              <span>Manage Staff</span>
            </a>
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <h3><Activity size={18} /> Recent Activity</h3>
        <div className="empty-state">
          <p>No recent activity. Start by registering patients or configuring your facility.</p>
        </div>
      </div>
    </div>
  )
}
