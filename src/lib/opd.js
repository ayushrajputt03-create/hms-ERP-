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
