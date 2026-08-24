import { describe, it, expect, vi } from 'vitest'
import { updateInsuranceClaimStatus, applyInvoiceDiscount, processRefund } from './billing'

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn((fnName, args) => {
      if (fnName === 'update_insurance_claim_status') {
        return Promise.resolve({
          data: {
            path: args.p_path,
            insuranceClaim: {
              status: args.p_status,
              approvedAmount: args.p_approved_amount,
              notes: args.p_remarks
            }
          },
          error: null
        })
      }
      if (fnName === 'apply_invoice_discount') {
        if (args.p_discount < 0) return Promise.resolve({ data: null, error: new Error('Discount cannot be negative') })
        return Promise.resolve({
          data: {
            path: args.p_path,
            discount: args.p_discount,
            discountReason: args.p_reason
          },
          error: null
        })
      }
      if (fnName === 'process_refund') {
        if (args.p_amount <= 0) return Promise.resolve({ data: null, error: new Error('Refund amount must be greater than zero') })
        return Promise.resolve({
          data: {
            path: args.p_path,
            refundedAmount: args.p_amount,
            reason: args.p_reason
          },
          error: null
        })
      }
      return Promise.resolve({ data: null, error: new Error('Unknown RPC') })
    })
  }
}))

describe('Phase 8 — Insurance, Discounts, and Refunds Billing Helpers', () => {
  it('calls update_insurance_claim_status RPC with correct params', async () => {
    const res = await updateInsuranceClaimStatus({
      path: 'facilities/f1/billing/inv1',
      status: 'approved',
      approvedAmount: 800,
      remarks: 'TPA Approved'
    })
    expect(res.insuranceClaim.status).toBe('approved')
    expect(res.insuranceClaim.approvedAmount).toBe(800)
    expect(res.insuranceClaim.notes).toBe('TPA Approved')
  })

  it('calls apply_invoice_discount RPC and applies it', async () => {
    const res = await applyInvoiceDiscount({
      path: 'facilities/f1/billing/inv1',
      discount: 200,
      reason: 'Special concession'
    })
    expect(res.discount).toBe(200)
    expect(res.discountReason).toBe('Special concession')
  })

  it('calls process_refund RPC and returns refunded value', async () => {
    const res = await processRefund({
      path: 'facilities/f1/billing/inv1',
      amount: 500,
      reason: 'Patient discharge correction'
    })
    expect(res.refundedAmount).toBe(500)
    expect(res.reason).toBe('Patient discharge correction')
  })
})
