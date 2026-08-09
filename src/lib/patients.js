// Patient demographics helpers shared by the patient form, the OPD
// registration desk and the printed slip.

import { supabase } from './supabase'

// Server-side patient lookup by name, phone or UHID, used by the dashboard
// search. Deliberately an RPC rather than a client-side filter over a
// subscribed collection: on a real tenant the patient register is far too
// large to ship to the browser just to run an ILIKE over it. The facility is
// taken from the caller's session inside the function, never from the client.
export async function searchPatients(query, limit = 20) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('search_patients', {
    p_query: query,
    p_limit: limit,
  })
  if (error) throw error
  return data || []
}

// Guardian relation as it is written on an Indian hospital record.
export const RELATION_TYPES = {
  SO: 'S/O',
  DO: 'D/O',
  WO: 'W/O',
}

// Medico-legal case. MLC visits are handled differently at the counter
// (police intimation, separate register), so it is flagged on the patient.
export const PATIENT_TYPES = {
  MLC: 'mlc',
  NON_MLC: 'non_mlc',
}

export const PATIENT_TYPE_LABELS = {
  mlc: 'MLC (Medico-Legal)',
  non_mlc: 'Non-MLC',
}

export const BILLING_TYPES = {
  GENERAL: 'general',
  PRIVATE: 'private',
  INSURANCE: 'insurance',
}

export const BILLING_TYPE_LABELS = {
  general: 'General',
  private: 'Private',
  insurance: 'Insurance',
}

// Age as hospitals record it: years for adults, but months and days matter for
// infants, so all three parts are kept and the empty leading ones dropped.
export function ageFromDob(dob, asOf = new Date()) {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime()) || birth > asOf) return null

  let years = asOf.getFullYear() - birth.getFullYear()
  let months = asOf.getMonth() - birth.getMonth()
  let days = asOf.getDate() - birth.getDate()

  if (days < 0) {
    // Borrow from the previous month, which is where its real length comes in.
    const prevMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 0).getDate()
    days += prevMonth
    months -= 1
  }
  if (months < 0) {
    months += 12
    years -= 1
  }
  return { years, months, days }
}

export function formatAge(dob, asOf) {
  const age = ageFromDob(dob, asOf)
  if (!age) return ''
  const parts = [
    age.years && `${age.years}Y`,
    age.months && `${age.months}M`,
    // A newborn shows "0Y 0M 3D" rather than an empty string.
    (age.days || (!age.years && !age.months)) && `${age.days}D`,
  ].filter(Boolean)
  return parts.join(' ')
}

// "34Y 2M / Male" — the line printed next to the patient's name.
export function formatAgeSex(patient) {
  const age = formatAge(patient?.dob)
  const sex = patient?.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : ''
  return [age, sex].filter(Boolean).join(' / ')
}

// Slips are handed over a public counter and left lying around, so the number
// is masked down to its last three digits everywhere it is displayed.
export function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 4) return digits ? '*'.repeat(digits.length) : ''
  return '*'.repeat(digits.length - 3) + digits.slice(-3)
}

// "S/O Ram Kumar" — omitted entirely when no guardian is recorded.
export function formatGuardian(patient) {
  if (!patient?.guardianName) return ''
  return `${patient.relationType || RELATION_TYPES.SO} ${patient.guardianName}`
}

const PHONE_RE = /^[6-9]\d{9}$/

export function normalisePhone(phone) {
  return String(phone || '').replace(/[\s-]/g, '').trim()
}

export function isValidPhone(phone) {
  return PHONE_RE.test(normalisePhone(phone))
}

// Front desk types a number and expects the returning patient to come up. The
// stored value may carry spacing or a +91, so both sides are reduced to their
// last ten digits before comparing.
export function findPatientsByPhone(patients = [], phone) {
  const needle = normalisePhone(phone).slice(-10)
  if (needle.length < 10) return []
  return patients.filter((p) => normalisePhone(p.phone).slice(-10) === needle)
}
