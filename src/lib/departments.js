// Departments are stored as documents at facilities/{fid}/departments.
// Doctors reference one via staff.departmentId; OPD visits and IPD admissions
// snapshot the department's name/floor/room at booking time so a later rename
// or relocation never rewrites an already-printed parchi.

export const DEPARTMENT_TYPES = {
  OPD: 'opd',
  IPD: 'ipd',
  BOTH: 'both',
}

export const DEPARTMENT_TYPE_LABELS = {
  opd: 'OPD only',
  ipd: 'IPD only',
  both: 'OPD & IPD',
}

export const isActive = (dept) => dept?.status !== 'inactive'

// A department serves a flow if it is typed for it or marked as serving both.
export function servesFlow(dept, flow) {
  const type = dept?.departmentType || DEPARTMENT_TYPES.BOTH
  return type === DEPARTMENT_TYPES.BOTH || type === flow
}

// Dropdown source: active departments that serve the given flow ('opd' | 'ipd').
export function departmentsForFlow(departments = [], flow) {
  return departments.filter((d) => isActive(d) && servesFlow(d, flow))
}

export function doctorsInDepartment(doctors = [], departmentId) {
  if (!departmentId) return []
  return doctors.filter((d) => d.departmentId === departmentId)
}

// "2nd Floor, A Wing" — omits the parts a facility hasn't filled in.
export function departmentLocation(dept) {
  if (!dept) return ''
  return [dept.floor, dept.wing].filter(Boolean).join(', ')
}

// The single line printed on a parchi and shown in detail headers.
export function departmentSummary({ departmentName, doctorName, floor, roomNumber, bedName }) {
  return [
    departmentName && `Dept: ${departmentName}`,
    doctorName && `Doctor: Dr. ${doctorName}`,
    floor && `Floor: ${floor}`,
    roomNumber && `Room: ${roomNumber}`,
    bedName && `Bed: ${bedName}`,
  ].filter(Boolean).join('  |  ')
}

// The department fields copied onto a visit/admission record.
export function departmentSnapshot(dept) {
  if (!dept) return { departmentId: null, departmentName: null, floor: null, wing: null, roomNumber: null }
  return {
    departmentId: dept.id,
    departmentName: dept.name || null,
    floor: dept.floor || null,
    wing: dept.wing || null,
    roomNumber: dept.roomNumber || null,
  }
}
