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

// A new facility starts with zero departments and, until now, every one had
// to be typed in by hand — name, code, floor, wing, room, one modal at a
// time. This is the standard department set an Indian hospital/clinic
// actually runs, so setup is "tick the ones you have" instead of data entry.
// Codes match common HIS convention (3-6 letters, no clashes with each other).
export const STANDARD_DEPARTMENTS = [
  { name: 'General Medicine', code: 'GMED', departmentType: 'both' },
  { name: 'General Surgery', code: 'GSURG', departmentType: 'both' },
  { name: 'Orthopedics', code: 'ORTHO', departmentType: 'both' },
  { name: 'Gynecology & Obstetrics', code: 'OBGYN', departmentType: 'both' },
  { name: 'Pediatrics', code: 'PEDS', departmentType: 'both' },
  { name: 'ENT', code: 'ENT', departmentType: 'both' },
  { name: 'Ophthalmology', code: 'OPHTH', departmentType: 'both' },
  { name: 'Dermatology', code: 'DERMA', departmentType: 'opd' },
  { name: 'Cardiology', code: 'CARDIO', departmentType: 'both' },
  { name: 'Neurology', code: 'NEURO', departmentType: 'both' },
  { name: 'Psychiatry', code: 'PSYCH', departmentType: 'opd' },
  { name: 'Dental', code: 'DENTAL', departmentType: 'opd' },
  { name: 'Urology', code: 'URO', departmentType: 'both' },
  { name: 'Nephrology', code: 'NEPHRO', departmentType: 'both' },
  { name: 'Oncology', code: 'ONCO', departmentType: 'both' },
  { name: 'Pulmonology', code: 'PULMO', departmentType: 'both' },
  { name: 'Gastroenterology', code: 'GASTRO', departmentType: 'both' },
  { name: 'Emergency / Casualty', code: 'ER', departmentType: 'opd' },
  { name: 'Radiology / Imaging', code: 'RADIO', departmentType: 'both' },
  { name: 'Pathology / Lab', code: 'PATH', departmentType: 'both' },
  { name: 'Anaesthesia', code: 'ANES', departmentType: 'ipd' },
  { name: 'Physiotherapy', code: 'PHYSIO', departmentType: 'opd' },
  { name: 'ICU / Critical Care', code: 'ICU', departmentType: 'ipd' },
]

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
