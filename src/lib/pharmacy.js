import { supabase } from './supabase'

export const EXPIRY_WINDOW_DAYS = 60
export const DISPENSE_ROLES = ['pharmacist', 'facility_admin', 'super_admin']
export const canDispense = (role) => DISPENSE_ROLES.includes(role)

// Atomic stock-out — the RPC locks each batch row and rejects insufficient stock.
export async function dispenseMedicine({ patientId, opdVisitId, items }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('dispense_medicine', {
    p_patient_id: patientId || null,
    p_opd_visit_id: opdVisitId || null,
    p_items: items,
  })
  if (error) throw error
  return data // sale id
}

// Current stock of a medicine = sum of its batches' quantities.
export function stockByMedicine(batches) {
  const map = {}
  for (const b of batches) {
    map[b.medicineId] = (map[b.medicineId] || 0) + (Number(b.quantity) || 0)
  }
  return map
}

export function isNearExpiry(dateStr, days = EXPIRY_WINDOW_DAYS) {
  if (!dateStr) return false
  const diff = (new Date(dateStr) - new Date()) / 86400000
  return diff >= 0 && diff <= days
}

export function isExpired(dateStr) {
  return !!dateStr && new Date(dateStr) < new Date()
}

// Counts surfaced on the sidebar nav badge.
export function pharmacyAlertCount(medicines, batches) {
  const stock = stockByMedicine(batches)
  const lowStock = medicines.filter(
    (m) => (Number(m.reorderThreshold) || 0) > 0 && (stock[m.id] || 0) < Number(m.reorderThreshold)
  ).length
  const nearExpiry = batches.filter(
    (b) => (Number(b.quantity) || 0) > 0 && isNearExpiry(b.expiryDate)
  ).length
  return { lowStock, nearExpiry, total: lowStock + nearExpiry }
}
