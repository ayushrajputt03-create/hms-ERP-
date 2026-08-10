// Sending a bill to the patient over WhatsApp.
//
// WHAT THIS DOES AND DOES NOT DO
//
// This opens WhatsApp with the message and the recipient already filled in;
// the cashier taps send. It does NOT deliver silently in the background.
//
// That is a deliberate limit, not an oversight. Delivering without a human in
// the loop requires the WhatsApp Business Platform (Meta Cloud API or a
// reseller such as Twilio), which needs a verified business, a registered
// sender number, a server-side access token, and — because this is an
// unprompted business message — a template approved by Meta in advance. Free
// text cannot be pushed to a patient who has not messaged first; that is
// enforced by WhatsApp, not by this code. None of those credentials exist in
// this project, and a token like that must never sit in a Vite bundle, where
// VITE_-prefixed variables are shipped to every browser.
//
// The PDF cannot ride along on a wa.me link either — the deep link carries
// text only. The bill is therefore summarised in the message and the PDF is
// still printed/saved locally for handover. When a Business API account does
// exist, sendInvoiceViaApi() below is the seam to implement: the message
// building here is already separate from the delivery mechanism.

import { formatINR } from './utils'

// WhatsApp expects digits only, country code included, no + and no spaces.
// An Indian mobile stored as "98765 43210" or "+91-9876543210" must reduce to
// 919876543210 or the link opens on a blank chat.
export function toWhatsAppNumber(phone, countryCode = '91') {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  // Already carries a country code.
  if (digits.length > 10) return digits.replace(/^0+/, '')
  if (digits.length === 10) return `${countryCode}${digits}`
  return ''
}

export function canWhatsApp(phone) {
  return toWhatsAppNumber(phone).length >= 11
}

// The message a patient receives. Kept short on purpose: it is read on a
// phone, and the itemised breakdown is on the PDF they are handed.
export function buildInvoiceMessage({ facility, invoice, patient }) {
  const total = Number(invoice?.total ?? invoice?.grandTotal ?? 0)
  const paidAmount = Number(invoice?.paidAmount) || 0
  const credited = Number(invoice?.creditedAmount) || 0
  const balance = invoice?.balanceDue != null
    ? Number(invoice.balanceDue)
    : Math.max(total - credited - paidAmount, 0)

  const lines = [
    `*${facility?.facilityName || 'Hospital'}*`,
    '',
    `Dear ${patient?.name || invoice?.patientName || 'Patient'},`,
    `Here are your bill details.`,
    '',
    `Bill No: ${invoice?.invoiceNumber || '—'}`,
  ]

  if (invoice?.patientUhid || patient?.uhid) {
    lines.push(`UHID: ${invoice?.patientUhid || patient?.uhid}`)
  }
  if (invoice?.createdAt) {
    lines.push(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`)
  }

  lines.push('', `Total: ${formatINR(total)}`)
  if (paidAmount > 0) lines.push(`Paid: ${formatINR(paidAmount)}`)
  if (credited > 0) lines.push(`Credit note: ${formatINR(credited)}`)

  // Balance is stated either way. "Paid in full" is the single most common
  // question a patient calls the counter back about.
  lines.push(balance > 0 ? `*Balance due: ${formatINR(balance)}*` : '*Paid in full. Thank you.*')

  if (facility?.phone) lines.push('', `For queries: ${facility.phone}`)

  return lines.join('\n')
}

// Opens WhatsApp with the chat and message prepared. Returns false when the
// number is unusable so the caller can say why rather than opening a blank tab.
export function openWhatsApp({ phone, message }) {
  const to = toWhatsAppNumber(phone)
  if (!to) return false
  // api.whatsapp.com/send resolves to the desktop app when installed and to
  // WhatsApp Web otherwise; wa.me bounces through an extra redirect.
  const url = `https://api.whatsapp.com/send?phone=${to}&text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export function sendInvoiceOnWhatsApp({ facility, invoice, patient }) {
  const phone = patient?.phone || invoice?.patientPhone
  return openWhatsApp({ phone, message: buildInvoiceMessage({ facility, invoice, patient }) })
}

// Seam for true server-side delivery, deliberately left unimplemented rather
// than faked. Implementing it means adding a Vercel function that holds the
// Business API token server-side (never VITE_-prefixed), uploading the PDF to
// obtain a media id, and sending an approved template. Until that exists,
// callers use sendInvoiceOnWhatsApp above, which is honest about needing a tap.
export async function sendInvoiceViaApi() {
  throw new Error('WHATSAPP_API_NOT_CONFIGURED')
}
