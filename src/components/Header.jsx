import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { signOut } from '@lib/auth'
import { getInitials } from '@lib/utils'
import { ROLE_LABELS } from '@lib/constants'
import { Moon, Sun, LogOut, User, Menu } from 'lucide-react'

export default function Header({ darkMode, onToggleDark, onToggleSidebar }) {
  const { user, staffProfile } = useAuth()
  const { facilityConfig } = useFacility()
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)

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
        <h1 className="header-title">
          {facilityConfig?.facilityName || 'HMS ERP'}
        </h1>
      </div>

      <div className="header-right">
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
