import { useLocation, useNavigate } from 'react-router-dom'
import { usePermission } from '@hooks/usePermission'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { MODULE_LABELS } from '@lib/constants'
import {
  LayoutDashboard, Users, Stethoscope, BedDouble, Pill,
  FlaskConical, Receipt, UserCog, Settings, BarChart3,
  ChevronLeft, ChevronRight, Activity,
} from 'lucide-react'

const MODULE_ICONS = {
  dashboard: LayoutDashboard,
  patients: Users,
  opd: Stethoscope,
  ipd: BedDouble,
  pharmacy: Pill,
  lab: FlaskConical,
  billing: Receipt,
  staff: UserCog,
  admin: Settings,
  reports: BarChart3,
}

const MODULE_ROUTES = {
  dashboard: '/',
  patients: '/patients',
  opd: '/opd',
  ipd: '/ipd',
  pharmacy: '/pharmacy',
  lab: '/lab',
  billing: '/billing',
  staff: '/staff',
  admin: '/admin',
  reports: '/reports',
}

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { visibleModules } = usePermission()
  const { facilityConfig } = useFacility()
  const { staffProfile } = useAuth()

  const modules = visibleModules()

  const isActive = (route) => {
    if (route === '/') return location.pathname === '/'
    return location.pathname.startsWith(route)
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-brand" onClick={() => navigate('/')}>
        <Activity size={28} className="sidebar-logo" />
        {!collapsed && (
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">
              {facilityConfig?.facilityName || 'HMS ERP'}
            </span>
            <span className="sidebar-brand-sub">
              {staffProfile?.role?.replace('_', ' ') || ''}
            </span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {modules.map((mod) => {
          const Icon = MODULE_ICONS[mod] || LayoutDashboard
          const route = MODULE_ROUTES[mod] || '/'
          return (
            <button
              key={mod}
              className={`sidebar-item ${isActive(route) ? 'active' : ''}`}
              onClick={() => navigate(route)}
              title={collapsed ? MODULE_LABELS[mod] : undefined}
            >
              <Icon size={20} />
              {!collapsed && <span>{MODULE_LABELS[mod]}</span>}
            </button>
          )
        })}
      </nav>

      <button className="sidebar-toggle" onClick={onToggle}>
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
  )
}
