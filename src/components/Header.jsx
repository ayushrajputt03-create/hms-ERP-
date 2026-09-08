import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { signOut } from '@lib/auth'
import { getInitials } from '@lib/utils'
import { ROLE_LABELS, HOSPITAL_DEPARTMENTS } from '@lib/constants'
import { Moon, Sun, LogOut, User, Menu, Building2, ChevronDown } from 'lucide-react'

export default function Header({ darkMode, onToggleDark, onToggleSidebar }) {
  const { user, staffProfile } = useAuth()
  const { facilityConfig } = useFacility()
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [showDeptMenu, setShowDeptMenu] = useState(false)
  const [activeDeptId, setActiveDeptId] = useState(() => {
    return localStorage.getItem('hms_active_dept') || staffProfile?.department || 'cardiology'
  })

  const currentDeptObj = HOSPITAL_DEPARTMENTS.find(d => d.id === activeDeptId) || HOSPITAL_DEPARTMENTS[0]

  const handleDeptSelect = (deptId) => {
    setActiveDeptId(deptId)
    localStorage.setItem('hms_active_dept', deptId)
    setShowDeptMenu(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="btn-icon header-menu-btn" onClick={onToggleSidebar}>
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-3">
          <h1 className="header-title">
            {facilityConfig?.facilityName || 'HMS ERP'}
          </h1>
          <span className="badge badge-info uppercase text-xs tracking-wider">
            Multi-Specialty
          </span>
        </div>
      </div>

      <div className="header-right flex items-center gap-3">
        {/* Department Switcher Dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            onClick={() => setShowDeptMenu(!showDeptMenu)}
            title="Switch Active Department Context"
          >
            <Building2 size={14} className="text-primary-600 dark:text-primary-400" />
            <span className="max-w-[120px] truncate">{currentDeptObj.name}</span>
            <ChevronDown size={12} className="text-slate-400" />
          </button>

          {showDeptMenu && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 z-50 max-h-72 overflow-y-auto"
              onClick={() => setShowDeptMenu(false)}
            >
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700">
                Active Department Scope
              </div>
              {HOSPITAL_DEPARTMENTS.map((dept) => (
                <button
                  key={dept.id}
                  onClick={() => handleDeptSelect(dept.id)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition ${
                    activeDeptId === dept.id ? 'font-bold text-primary-600 dark:text-primary-400 bg-primary-50/50 dark:bg-primary-950/20' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{dept.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-500">
                    {dept.code}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="btn-icon" onClick={onToggleDark} title="Toggle theme">
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="header-user" onClick={() => setShowMenu(!showMenu)}>
          <div className="header-avatar">
            {getInitials(user?.displayName || staffProfile?.name || 'U')}
          </div>
          <div className="header-user-info">
            <span className="header-user-name">
              {user?.displayName || staffProfile?.name || 'User'}
            </span>
            <span className="header-user-role">
              {ROLE_LABELS[staffProfile?.role] || ''}
            </span>
          </div>
        </div>

        {showMenu && (
          <div className="header-dropdown" onClick={() => setShowMenu(false)}>
            <button onClick={() => navigate('/admin/profile')}>
              <User size={16} /> Profile
            </button>
            <button onClick={handleSignOut}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
