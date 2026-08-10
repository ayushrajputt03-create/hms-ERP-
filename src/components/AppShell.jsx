import { useState, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

// Deliberately small and inline. A full-screen spinner for a chunk that is
// usually already cached reads as a stall.
function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="page-loader-spinner" />
    </div>
  )
}

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
        {/* The Suspense boundary for lazy pages lives HERE, not around the
            whole router. Above the shell it meant every navigation replaced
            the sidebar, header and content with a full-screen "Loading
            module..." and then remounted all three — so moving between pages
            looked like the app was reloading each time. Scoped to the outlet,
            only the content pane waits and the chrome stays put. */}
        <main className="page-content">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
