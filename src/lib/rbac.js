import { ROLES, MODULES } from './constants'

const ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
}

const ALL_ACTIONS = Object.values(ACTIONS)
const CRUD = [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE]
const VIEW_ONLY = [ACTIONS.VIEW]
const VIEW_EXPORT = [ACTIONS.VIEW, ACTIONS.EXPORT]
const CREATE_VIEW = [ACTIONS.VIEW, ACTIONS.CREATE]

const PERMISSION_MATRIX = {
  [ROLES.SUPER_ADMIN]: {
    [MODULES.DASHBOARD]: ALL_ACTIONS,
    [MODULES.PATIENTS]: ALL_ACTIONS,
    [MODULES.OPD]: ALL_ACTIONS,
    [MODULES.IPD]: ALL_ACTIONS,
    [MODULES.PHARMACY]: ALL_ACTIONS,
    [MODULES.LAB]: ALL_ACTIONS,
    [MODULES.BILLING]: ALL_ACTIONS,
    [MODULES.STAFF]: ALL_ACTIONS,
    [MODULES.ADMIN]: ALL_ACTIONS,
    [MODULES.REPORTS]: ALL_ACTIONS,
    [MODULES.ACCOUNTS]: ALL_ACTIONS,
  },
  [ROLES.FACILITY_ADMIN]: {
    [MODULES.DASHBOARD]: ALL_ACTIONS,
    [MODULES.PATIENTS]: ALL_ACTIONS,
    [MODULES.OPD]: ALL_ACTIONS,
    [MODULES.IPD]: ALL_ACTIONS,
    [MODULES.PHARMACY]: ALL_ACTIONS,
    [MODULES.LAB]: ALL_ACTIONS,
    [MODULES.BILLING]: ALL_ACTIONS,
    [MODULES.STAFF]: ALL_ACTIONS,
    [MODULES.ADMIN]: ALL_ACTIONS,
    [MODULES.REPORTS]: ALL_ACTIONS,
    [MODULES.ACCOUNTS]: ALL_ACTIONS,
  },
  [ROLES.DOCTOR]: {
    [MODULES.DASHBOARD]: VIEW_ONLY,
    [MODULES.PATIENTS]: CRUD,
    [MODULES.OPD]: CRUD,
    [MODULES.IPD]: CRUD,
    [MODULES.PHARMACY]: VIEW_ONLY,
    [MODULES.LAB]: CREATE_VIEW,
    [MODULES.BILLING]: VIEW_ONLY,
    // No STAFF entry: staff management controls who can access what, so it is
    // restricted to facility_admin/super_admin only.
    [MODULES.REPORTS]: VIEW_ONLY,
  },
  [ROLES.NURSE]: {
    [MODULES.DASHBOARD]: VIEW_ONLY,
    [MODULES.PATIENTS]: [ACTIONS.VIEW, ACTIONS.UPDATE],
    [MODULES.OPD]: VIEW_ONLY,
    [MODULES.IPD]: [ACTIONS.VIEW, ACTIONS.UPDATE],
    [MODULES.PHARMACY]: VIEW_ONLY,
    [MODULES.LAB]: VIEW_ONLY,
    [MODULES.BILLING]: VIEW_ONLY,
  },
  [ROLES.RECEPTIONIST]: {
    [MODULES.DASHBOARD]: VIEW_ONLY,
    [MODULES.PATIENTS]: CRUD,
    [MODULES.OPD]: CRUD,
    [MODULES.IPD]: VIEW_ONLY,
    [MODULES.BILLING]: CREATE_VIEW,
  },
  [ROLES.PHARMACIST]: {
    [MODULES.DASHBOARD]: VIEW_ONLY,
    [MODULES.PATIENTS]: VIEW_ONLY,
    [MODULES.OPD]: VIEW_ONLY,
    [MODULES.IPD]: VIEW_ONLY,
    [MODULES.PHARMACY]: CRUD,
    [MODULES.BILLING]: CREATE_VIEW,
    [MODULES.REPORTS]: VIEW_ONLY,
  },
  [ROLES.LAB_TECH]: {
    [MODULES.DASHBOARD]: VIEW_ONLY,
    [MODULES.PATIENTS]: VIEW_ONLY,
    [MODULES.LAB]: CRUD,
    [MODULES.BILLING]: VIEW_ONLY,
    [MODULES.REPORTS]: VIEW_ONLY,
  },
  [ROLES.BILLING_STAFF]: {
    [MODULES.DASHBOARD]: VIEW_ONLY,
    [MODULES.PATIENTS]: VIEW_ONLY,
    [MODULES.OPD]: VIEW_ONLY,
    [MODULES.IPD]: VIEW_ONLY,
    [MODULES.PHARMACY]: VIEW_ONLY,
    [MODULES.LAB]: VIEW_ONLY,
    [MODULES.BILLING]: CRUD,
    [MODULES.REPORTS]: VIEW_EXPORT,
    // Books and expenses are this role's job. Payroll is not: it exposes
    // every colleague's salary, so pay_salary is admin-only server-side and
    // the Payroll tab is hidden for them.
    [MODULES.ACCOUNTS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EXPORT],
  },
}

export function can(role, module, action) {
  if (!role || !module || !action) return false
  const rolePerms = PERMISSION_MATRIX[role]
  if (!rolePerms) return false
  const modulePerms = rolePerms[module]
  if (!modulePerms) return false
  return modulePerms.includes(action)
}

export function getModulesForRole(role) {
  const rolePerms = PERMISSION_MATRIX[role]
  if (!rolePerms) return []
  return Object.keys(rolePerms).filter((mod) => rolePerms[mod]?.includes(ACTIONS.VIEW))
}

export function getPermittedActions(role, module) {
  const rolePerms = PERMISSION_MATRIX[role]
  if (!rolePerms) return []
  return rolePerms[module] || []
}

export { ACTIONS }
