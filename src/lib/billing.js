import { supabase } from './supabase'
import { queryDocuments } from './db'

// Fallback consultation fee if a visit has no stored fee / no tariff configured.
export const CONSULT_FALLBACK = 500
export const DEFAULT_GST_RATE = 18
export const PAYMENT_MODES = ['cash', 'upi', 'card', 'insurance']
export const PAYMENT_MODE_LABELS = { cash: 'Cash', upi: 'UPI', card: 'Card', insurance: 'Insurance / TPA' }

// ---- Pending-item sources ---------------------------------------------------
// Each source turns a patient's un-billed activity into candidate line items.
// Add IPD / pharmacy / lab sources here later — the bill builder consumes them
// uniformly, so it never has to know where an item came from.

async function opdSource(facilityId, patientId) {
  const visits = await queryDocuments(`facilities/${facilityId}/opdVisits`, {
    orderBy: 'patientId', equalTo: patientId,
  })
  return visits
    .filter((v) => v.status === 'completed' && v.billed !== true)
    .map((v) => ({
      source: 'opd',
      visitId: v.id,
      description: `OPD Consultation${v.doctorName ? ' — Dr. ' + v.doctorName : ''}`
        + (v.tokenNumber ? ` (Token ${v.tokenNumber})` : ''),
      amount: Number(v.consultationFee) || CONSULT_FALLBACK,
      date: v.visitDate || v.createdAt,
    }))
}

const PENDING_SOURCES = [opdSource]
// Future: const PENDING_SOURCES = [opdSource, ipdSource, pharmacySource, labSource]

export async function getPendingItems(facilityId, patientId) {
  if (!facilityId || !patientId) return []
  const groups = await Promise.all(PENDING_SOURCES.map((fn) => fn(facilityId, patientId)))
  return groups.flat().sort((a, b) => (b.date || 0) - (a.date || 0))
}

// ---- Totals -----------------------------------------------------------------
export function computeTotals({ items, gstEnabled, gstRate = DEFAULT_GST_RATE, discount = 0 }) {
  const subtotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const gstAmount = gstEnabled ? Math.round(subtotal * gstRate) / 100 : 0
  const total = Math.max(0, subtotal + gstAmount - (Number(discount) || 0))
  return { subtotal, gstAmount, total }
}

// ---- Invoice creation (atomic, race-safe RPC) -------------------------------
export async function createInvoiceFromVisits({
  visitIds, lineItems, subtotal, gstAmount, discount, discountReason, total, paymentMode, insurance,
}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('create_invoice_from_opd_visits', {
    p_visit_ids: visitIds,
    p_line_items: lineItems,
    p_subtotal: subtotal,
    p_gst_amount: gstAmount,
    p_discount: discount || 0,
    p_discount_reason: discountReason || null,
    p_total: total,
    p_payment_mode: paymentMode,
    p_insurance: insurance || null,
  })
  if (error) throw error
  return data // new invoice id
}

// The invoice-creating roles. Receptionist is intentionally excluded (read-only billing).
export const BILLING_ROLES = ['billing_staff', 'facility_admin', 'super_admin']
export const canBill = (role) => BILLING_ROLES.includes(role)
