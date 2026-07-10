import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('hms-theme') === 'dark'
  )

  const toggleDark = () => {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem('hms-theme', next ? 'dark' : 'light')
  }

  return (
    <div className={`app-shell ${darkMode ? 'theme-dark' : 'theme-light'}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="app-main">
        <Header
          darkMode={darkMode}
          onToggleDark={toggleDark}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
