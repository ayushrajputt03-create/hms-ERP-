import { supabase } from './supabase'

// Atomic bed admission — server locks the ward row and rejects an occupied bed,
// so two staff can't double-book the same bed.
export async function admitPatient({ patientId, doctorId, wardId, bedId, diagnosis, departmentId }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('admit_patient', {
    p_patient_id: patientId, p_doctor_id: doctorId,
    p_ward_id: wardId, p_bed_id: bedId, p_diagnosis: diagnosis || null,
    // The server resolves the department's floor/wing/room itself, so the
    // admission is stamped under the same lock that claims the bed.
    p_department_id: departmentId || null,
  })
  if (error) throw error
  return data // admission id
}

// Discharge — writes summary, computes stay days, flips the bed to 'cleaning'.
export async function dischargePatient({ admissionId, summary }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('discharge_patient', {
    p_admission_id: admissionId, p_discharge_summary: summary || null,
  })
  if (error) throw error
  return data
}

// One-way MAR: mark a scheduled dose administered (server stamps who + when).
export async function administerDose({ admissionId, doseId }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('administer_dose', {
    p_admission_id: admissionId, p_dose_id: doseId,
  })
  if (error) throw error
}
