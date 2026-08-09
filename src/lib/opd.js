import { supabase } from './supabase'

export const TARIFF_ROLES = ['facility_admin', 'super_admin']
export const canEditTariffs = (role) => TARIFF_ROLES.includes(role)

// Completes a visit server-side. The consultation fee is resolved by the
// database from the tariff master — the client never supplies an amount, so a
// tampered request cannot set its own price.
export async function completeOpdVisit({ facilityId, visitId, clinical }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('complete_opd_visit', {
    p_path: `facilities/${facilityId}/opdVisits/${visitId}`,
    p_clinical: clinical,
  })
  if (error) throw error
  return data
}

// Registers an OPD visit. The token number and department register number are
// claimed by the server in the same transaction that writes the visit, so two
// counters booking into one department can never be handed the same token.
// Department, doctor-department membership and the fee are validated server-side
// too — the client supplies none of them.
export async function registerOpdVisit({
  patientId, departmentId, doctorId, visitDate, chiefComplaint, billingType, unit,
}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('register_opd_visit', {
    p_patient_id: patientId,
    p_department_id: departmentId,
    p_doctor_id: doctorId,
    p_visit_date: visitDate ?? null,
    p_chief_complaint: chiefComplaint || null,
    p_billing_type: billingType || 'general',
    p_unit: unit || null,
  })
  if (error) throw error
  return data // the full visit record, including id, tokenNumber and deptRegNo
}

// Server error codes are terse by design; this is the counter-facing wording.
const REGISTRATION_ERRORS = {
  DEPARTMENT_NOT_FOUND: 'That department no longer exists. Pick another one.',
  DEPARTMENT_INACTIVE: 'That department is inactive and cannot take registrations.',
  DEPARTMENT_NOT_OPD: 'That department does not run an OPD.',
  PATIENT_NOT_FOUND: 'That patient record no longer exists.',
  DOCTOR_NOT_FOUND: 'That doctor no longer exists.',
  DOCTOR_NOT_IN_DEPARTMENT: 'That doctor is not assigned to the selected department.',
  NOT_A_FACILITY_MEMBER: 'You do not have access to this facility.',
}

export function registrationErrorMessage(err) {
  const raw = err?.message || ''
  const hit = Object.keys(REGISTRATION_ERRORS).find((code) => raw.includes(code))
  return hit ? REGISTRATION_ERRORS[hit] : 'Failed to register the visit. Please retry.'
}

// Preview the fee the server will charge, for display before ending a visit.
export async function previewConsultationFee({ facilityId, doctorId }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('get_consultation_fee', {
    p_facility_id: facilityId,
    p_doctor_id: doctorId || null,
  })
  if (error) throw error
  return Number(data) || 0
}

// Looks up today's (or a given day's) token at the registration desk.
//
// Returns an ARRAY of matches, not one visit. Tokens are issued per department
// (staff desk) and per doctor (QR kiosk), never hospital-wide, so "token 7" can
// legitimately belong to more than one patient on the same morning. The desk
// disambiguates by department/doctor rather than the server guessing.
export async function getVisitByToken({ tokenNumber, tokenDate }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('get_visit_by_token', {
    p_token_number: Number(tokenNumber),
    p_token_date: tokenDate || null,
  })
  if (error) throw error
  // { tokenNumber, tokenDate, issuedUpTo, matches: [...] }
  // issuedUpTo is the day's counter, which lets the caller say "never issued"
  // rather than just "not found" when the number is above it.
  return data
}

// Reception assigns department and doctor to a self-booked (QR) visit. The
// public booking deliberately leaves both null — this is where the triage
// decision is actually made, and it runs the same department/doctor validation
// register_opd_visit does so a QR visit cannot reach a state the counter could
// not have produced.
//
// The token is NOT reissued: the patient is already holding it.
export async function assignQrVisit({ visitId, departmentId, doctorId }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('hms_assign_qr_visit', {
    p_visit_id: visitId,
    p_department_id: departmentId,
    p_doctor_id: doctorId,
  })
  if (error) throw error
  return data
}

const ASSIGN_ERRORS = {
  VISIT_NOT_FOUND: 'That visit no longer exists.',
  // Two counters opened the same pending token. Re-allocating would burn a
  // department register number and leave a gap in the register.
  VISIT_ALREADY_ASSIGNED: 'This token has already been assigned by another counter.',
  DEPARTMENT_NOT_FOUND: 'That department no longer exists. Pick another one.',
  DEPARTMENT_INACTIVE: 'That department is inactive and cannot take registrations.',
  DEPARTMENT_NOT_OPD: 'That department does not run an OPD.',
  DOCTOR_NOT_FOUND: 'That doctor no longer exists.',
  DOCTOR_NOT_IN_DEPARTMENT: 'That doctor is not assigned to the selected department.',
  NOT_A_FACILITY_MEMBER: 'You do not have access to this facility.',
}

export function assignErrorMessage(err) {
  const raw = err?.message || ''
  const hit = Object.keys(ASSIGN_ERRORS).find((code) => raw.includes(code))
  return hit ? ASSIGN_ERRORS[hit] : 'Could not assign this token. Please retry.'
}
