import { Navigate } from 'react-router-dom'
import { usePermission } from '@hooks/usePermission'
import { useFacility } from '@hooks/useFacility'
import LoadingScreen from './LoadingScreen'

export default function ModuleGate({ module, action = 'view', children }) {
  const { canDo } = usePermission()
  const { isModuleEnabled, loading } = useFacility()

  // Wait for the facility config before deciding. isModuleEnabled() reports
  // false while the config is still in flight, which is indistinguishable from
  // "switched off" — so without this guard, any hard load of a module route
  // (a refresh, a bookmark, a plain <a href>) redirected to the dashboard
  // before the config had a chance to arrive.
  if (loading) {
    return <LoadingScreen message="Loading module..." />
  }

  if (!isModuleEnabled(module)) {
    return <Navigate to="/" replace />
  }

  if (!canDo(module, action)) {
    return (
      <div className="access-denied">
        <h2>Access Denied</h2>
        <p>You don't have permission to access this module.</p>
      </div>
    )
  }

  return children
}
