import { describe, test, expect } from 'vitest'
import { toWhatsAppNumber, canWhatsApp, buildInvoiceMessage } from './whatsapp'

describe('toWhatsAppNumber', () => {
  test('adds the country code to a bare 10-digit mobile', () => {
    expect(toWhatsAppNumber('9876543210')).toBe('919876543210')
  })

  test('strips the formatting a counter clerk actually types', () => {
    expect(toWhatsAppNumber('98765 43210')).toBe('919876543210')
    expect(toWhatsAppNumber('+91-9876543210')).toBe('919876543210')
    expect(toWhatsAppNumber('(+91) 98765-43210')).toBe('919876543210')
  })

  test('keeps a number that already carries a country code', () => {
    expect(toWhatsAppNumber('919876543210')).toBe('919876543210')
  })

  test('drops a leading zero from a trunk-prefixed number', () => {
    // 0919876543210 dialled as-is opens a chat with nobody.
    expect(toWhatsAppNumber('0919876543210')).toBe('919876543210')
  })

  test('returns empty for anything too short to dial', () => {
    expect(toWhatsAppNumber('12345')).toBe('')
    expect(toWhatsAppNumber('')).toBe('')
    expect(toWhatsAppNumber(null)).toBe('')
    expect(toWhatsAppNumber('not a phone')).toBe('')
  })
})

describe('canWhatsApp', () => {
  test('accepts a real mobile and rejects a stub', () => {
    expect(canWhatsApp('9876543210')).toBe(true)
    expect(canWhatsApp('123')).toBe(false)
    expect(canWhatsApp(undefined)).toBe(false)
  })
})

describe('buildInvoiceMessage', () => {
  const facility = { facilityName: 'City Hospital', phone: '0120-4567890' }
  const patient = { name: 'Ram Kumar', uhid: 'PT-2026-00007', phone: '9876543210' }

  test('states the outstanding balance when the bill is part-paid', () => {
    const msg = buildInvoiceMessage({
      facility, patient,
      invoice: { invoiceNumber: 'INV-12', total: 2000, paidAmount: 500 },
    })
    expect(msg).toContain('INV-12')
    expect(msg).toContain('Balance due')
    expect(msg).not.toContain('Paid in full')
  })

  test('says paid in full rather than showing a zero balance', () => {
    const msg = buildInvoiceMessage({
      facility, patient,
      invoice: { invoiceNumber: 'INV-13', total: 2000, paidAmount: 2000 },
    })
    expect(msg).toContain('Paid in full')
    expect(msg).not.toContain('Balance due')
  })

  test('honours an explicit balanceDue over recomputing it', () => {
    // The invoice document is authoritative once billing has written it.
    const msg = buildInvoiceMessage({
      facility, patient,
      invoice: { invoiceNumber: 'INV-14', total: 2000, paidAmount: 0, balanceDue: 0 },
    })
    expect(msg).toContain('Paid in full')
  })

  test('subtracts a credit note from the balance', () => {
    const msg = buildInvoiceMessage({
      facility, patient,
      invoice: { invoiceNumber: 'INV-15', total: 2000, paidAmount: 0, creditedAmount: 2000 },
    })
    expect(msg).toContain('Paid in full')
  })

  test('falls back to the invoice name when no patient record is loaded', () => {
    const msg = buildInvoiceMessage({
      facility, patient: null,
      invoice: { invoiceNumber: 'INV-16', total: 100, patientName: 'Sita Devi' },
    })
    expect(msg).toContain('Sita Devi')
    expect(msg).not.toContain('undefined')
  })

  test('never emits undefined for a sparse invoice', () => {
    const msg = buildInvoiceMessage({ facility: {}, patient: {}, invoice: {} })
    expect(msg).not.toContain('undefined')
    expect(msg).not.toContain('NaN')
  })
})
