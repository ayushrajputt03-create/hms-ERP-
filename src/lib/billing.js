import { supabase } from './supabase'
import { queryDocuments } from './db'
import { formatINR } from './utils'

// Fallback consultation fee if a visit has no stored fee / no tariff configured.
export const CONSULT_FALLBACK = 500
export const DEFAULT_GST_RATE = 18
export const PAYMENT_MODES = ['cash', 'upi', 'card', 'insurance', 'bank_transfer']
export const PAYMENT_MODE_LABELS = {
  cash: 'Cash', upi: 'UPI', card: 'Card', insurance: 'Insurance / TPA', bank_transfer: 'Bank Transfer',
}

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
      key: `opd:${v.id}`,
      source: 'opd',
      visitId: v.id,
      description: `OPD Consultation${v.doctorName ? ' — Dr. ' + v.doctorName : ''}`
        + (v.tokenNumber ? ` (Token ${v.tokenNumber})` : ''),
      amount: Number(v.consultationFee) || CONSULT_FALLBACK,
      date: v.visitDate || v.createdAt,
    }))
}

async function ipdSource(facilityId, patientId) {
  const admissions = await queryDocuments(`facilities/${facilityId}/ipd/admissions`, {
    orderBy: 'patientId', equalTo: patientId,
  })
  return admissions
    .filter((a) => a.status === 'discharged' && a.billed !== true)
    .map((a) => {
      const days = a.stayDays || 1
      const rate = Number(a.ratePerDay) || 0
      return {
        key: `ipd:${a.id}`,
        source: 'ipd',
        admissionId: a.id,
        description: `IPD Room Charges — ${a.wardName || 'Ward'}/${a.bedName || ''} `
          + `(${days} day${days !== 1 ? 's' : ''} × ${formatINR(rate)})`,
        amount: days * rate,
        date: a.dischargedAt || a.admissionDate,
      }
    })
}

async function pharmacySource(facilityId, patientId) {
  const sales = await queryDocuments(`facilities/${facilityId}/pharmacy/sales`, {
    orderBy: 'patientId', equalTo: patientId,
  })
  return sales
    .filter((s) => s.type === 'prescription' && s.billed !== true)
    .map((s) => ({
      key: `pharmacy:${s.id}`,
      source: 'pharmacy',
      saleId: s.id,
      description: `Pharmacy — ${(s.items || []).map((i) => `${i.name} ×${i.quantity}`).join(', ')}`,
      amount: Number(s.total) || 0,
      date: s.saleDate || s.createdAt,
    }))
}

// Extensible: add labSource here later — the bill builder consumes every source
// uniformly by { key, source, description, amount }.
const PENDING_SOURCES = [opdSource, ipdSource, pharmacySource]

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
// Bills any mix of OPD visits and discharged IPD admissions into one invoice,
// flipping each source's billed flag in the same transaction.
export async function createInvoice({
  visitIds = [], admissionIds = [], saleIds = [], lineItems,
  subtotal, gstAmount, discount, discountReason, total, paymentMode, insurance,
  patientId, patientName, patientUhid,
}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('create_invoice', {
    p_visit_ids: visitIds,
    p_admission_ids: admissionIds,
    p_sale_ids: saleIds,
    p_line_items: lineItems,
    p_subtotal: subtotal,
    p_gst_amount: gstAmount,
    p_discount: discount || 0,
    p_discount_reason: discountReason || null,
    p_total: total,
    p_payment_mode: paymentMode,
    p_insurance: insurance || null,
    // Only used when there's no source visit/admission/sale to read the
    // patient off of, e.g. a manual-only invoice (walk-in charge with no
    // OPD/IPD record behind it).
    p_patient_id: patientId || null,
    p_patient_name: patientName || null,
    p_patient_uhid: patientUhid || null,
  })
  if (error) throw error
  return data // new invoice id
}

// The invoice-creating roles. Receptionist is intentionally excluded (read-only billing).
export const BILLING_ROLES = ['billing_staff', 'facility_admin', 'super_admin']
export const canBill = (role) => BILLING_ROLES.includes(role)

// ---- Payment collection (partial / multi-mode) ------------------------------
// Appends one payment to the invoice's own document under a row lock, so two
// front-desk clicks can never double count. Server recomputes paidAmount,
// balanceDue, and paymentStatus (pending / partially_paid / paid) itself.
export async function recordPayment({ invoiceId, amount, mode, referenceNumber, paymentDate }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('record_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_mode: mode,
    p_reference: referenceNumber || null,
    p_date: paymentDate || null,
  })
  if (error) throw error
  return data
}

// Credit notes correct a finalized invoice's balance without editing its
// locked totals directly — only valid once the invoice has taken a payment.
export async function addCreditNote({ invoiceId, reason, amount }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('add_credit_note', {
    p_invoice_id: invoiceId,
    p_reason: reason,
    p_amount: amount,
  })
  if (error) throw error
  return data
}
