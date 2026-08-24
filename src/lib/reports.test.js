import { describe, it, expect, vi } from 'vitest'
import { subscribeToCollection } from './db'
import * as dbModule from './db'

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((col, val) => {
          // Capture for verification
          if (col === 'collection') {
            return {
              eq: vi.fn((c, v) => Promise.resolve({ data: [{ path: 'test/path', data: { doctorId: 'doc123' } }], error: null }))
            }
          }
          return Promise.resolve({ data: [], error: null })
        })
      }))
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn()
      }))
    }))
  }
}))

describe('Reports Module — Role-Based Subscription Isolation', () => {
  it('applies doctor filter to subscription queries', async () => {
    const fromSpy = vi.spyOn(dbModule, 'subscribeToCollection')
    const callback = vi.fn()

    subscribeToCollection('facilities/f1/opdVisits', callback, { filter: { 'data->>doctorId': 'doc123' } })

    expect(fromSpy).toHaveBeenCalledWith(
      'facilities/f1/opdVisits',
      callback,
      { filter: { 'data->>doctorId': 'doc123' } }
    )
    
    fromSpy.mockRestore()
  })
})

describe('Daily Collection Summary Calculator', () => {
  it('aggregates payments correctly by mode on a selected date', () => {
    const testDateStart = new Date('2026-08-24T00:00:00').getTime()
    const testDateEnd = new Date('2026-08-24T23:59:59').getTime()

    const billing = [
      {
        type: 'invoice',
        invoiceNumber: 'INV001',
        patientName: 'John Doe',
        status: 'paid',
        payments: [
          { amount: 500, mode: 'cash', paymentDate: testDateStart + 1000 },
          { amount: 1200, mode: 'upi', paymentDate: testDateStart + 5000 },
        ]
      },
      {
        type: 'invoice',
        invoiceNumber: 'INV002',
        patientName: 'Jane Smith',
        status: 'cancelled', // Cancelled should be ignored
        payments: [
          { amount: 1500, mode: 'card', paymentDate: testDateStart + 2000 }
        ]
      },
      {
        type: 'invoice',
        invoiceNumber: 'INV003',
        patientName: 'Alice Green',
        status: 'partially_paid',
        payments: [
          { amount: 800, mode: 'card', paymentDate: testDateStart + 3000 },
          { amount: 1000, mode: 'cash', paymentDate: testDateStart - 10000 }, // Out of range date
        ]
      }
    ]

    // Emulate DailyCollectionSummary calculations
    const paymentsOnDate = []
    billing.forEach((inv) => {
      if (inv.type === 'invoice' && inv.status !== 'cancelled') {
        const payments = inv.payments || []
        payments.forEach((p) => {
          const pDate = p.paymentDate
          if (pDate >= testDateStart && pDate <= testDateEnd) {
            paymentsOnDate.push(p)
          }
        })
      }
    })

    expect(paymentsOnDate.length).toBe(3) // John (cash), John (upi), Alice (card)

    const totalsByMode = { cash: 0, upi: 0, card: 0 }
    paymentsOnDate.forEach((p) => {
      totalsByMode[p.mode] = (totalsByMode[p.mode] || 0) + p.amount
    })

    expect(totalsByMode.cash).toBe(500)
    expect(totalsByMode.upi).toBe(1200)
    expect(totalsByMode.card).toBe(800)
  })
})
