import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { useFacility } from './useFacility'
import { can, getModulesForRole, getPermittedActions } from '@lib/rbac'

export function usePermission() {
  const { staffProfile } = useAuth()
  const { isModuleEnabled } = useFacility()

  const role = staffProfile?.role

  const canDo = useCallback(
    (module, action) => {
      if (!role) return false
      if (!isModuleEnabled(module)) return false
      return can(role, module, action)
    },
    [role, isModuleEnabled]
  )

  const visibleModules = useCallback(() => {
    if (!role) return []
    return getModulesForRole(role).filter(isModuleEnabled)
  }, [role, isModuleEnabled])

  const actions = useCallback(
    (module) => getPermittedActions(role, module),
    [role]
  )

  // `can` is the primary API used across modules; `canDo` kept as an alias.
  return { can: canDo, canDo, visibleModules, actions, role }
}
