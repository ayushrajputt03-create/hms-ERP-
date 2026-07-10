import { Navigate } from 'react-router-dom'
import { usePermission } from '@hooks/usePermission'
import { useFacility } from '@hooks/useFacility'

export default function ModuleGate({ module, action = 'view', children }) {
  const { canDo } = usePermission()
  const { isModuleEnabled } = useFacility()

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
