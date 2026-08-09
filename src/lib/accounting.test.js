import { describe, it, expect } from 'vitest'
import {
  trialBalanceTotals, groupByAccountType, canPostAccounting,
  ACCOUNT_TYPES, DEPOSIT_MODES,
} from './accounting'

// Pure helpers only. The rules that actually protect the ledger — the balance
// check, the account whitelist, idempotency — live in Postgres and are covered
// by accounting.db.test.js, because asserting them here would only test a
// JavaScript reimplementation of them rather than the thing that runs.

const row = (over = {}) => ({
  account_code: '1010', account_name: 'Bank/Cash A/c', account_type: 'ASSET',
  normal_balance: 'DR', total_debit: 0, total_credit: 0, balance: 0, ...over,
})

describe('trialBalanceTotals', () => {
  it('reports a balanced set of books as balanced', () => {
    const rows = [
      row({ account_code: '1010', total_debit: 1000 }),
      row({ account_code: '3010', account_type: 'REVENUE', total_credit: 1000 }),
    ]

    const totals = trialBalanceTotals(rows)

    expect(totals.totalDebit).toBe(1000)
    expect(totals.totalCredit).toBe(1000)
    expect(totals.balanced).toBe(true)
    expect(totals.difference).toBe(0)
  })

  it('flags a trial balance that does not tie', () => {
    const rows = [
      row({ total_debit: 1000 }),
      row({ account_type: 'REVENUE', total_credit: 700 }),
    ]

    const totals = trialBalanceTotals(rows)

    expect(totals.balanced).toBe(false)
    expect(totals.difference).toBe(300)
  })

  it('tolerates sub-paise float residue rather than crying imbalance', () => {
    // 100 split three ways comes back as 33.34 + 33.33 + 33.33 from Postgres
    // numerics; summing those in JS floats does not land exactly on 100.
    const rows = [
      row({ total_debit: 100 }),
      row({ account_type: 'REVENUE', total_credit: 33.34 }),
      row({ account_type: 'REVENUE', total_credit: 33.33 }),
      row({ account_type: 'REVENUE', total_credit: 33.33 }),
    ]

    expect(trialBalanceTotals(rows).balanced).toBe(true)
  })

  it('does not report a real one-rupee gap as rounding noise', () => {
    const rows = [
      row({ total_debit: 100 }),
      row({ account_type: 'REVENUE', total_credit: 99 }),
    ]

    expect(trialBalanceTotals(rows).balanced).toBe(false)
  })

  it('treats an empty ledger as balanced', () => {
    expect(trialBalanceTotals([]).balanced).toBe(true)
    expect(trialBalanceTotals().balanced).toBe(true)
  })

  it('coerces string numerics, which is how supabase-js returns numeric columns', () => {
    const rows = [
      row({ total_debit: '1000.00' }),
      row({ account_type: 'REVENUE', total_credit: '1000.00' }),
    ]

    const totals = trialBalanceTotals(rows)

    expect(totals.totalDebit).toBe(1000)
    expect(totals.balanced).toBe(true)
  })
})

describe('groupByAccountType', () => {
  it('groups rows in the conventional balance-sheet order', () => {
    const rows = [
      row({ account_type: 'EXPENSE', balance: 50 }),
      row({ account_type: 'ASSET', balance: 100 }),
      row({ account_type: 'REVENUE', balance: 200 }),
    ]

    expect(groupByAccountType(rows).map((g) => g.type))
      .toEqual(['ASSET', 'REVENUE', 'EXPENSE'])
  })

  it('omits account types with no activity instead of rendering empty tables', () => {
    const groups = groupByAccountType([row({ account_type: 'ASSET' })])

    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('ASSET')
  })

  it('totals each group', () => {
    const rows = [
      row({ account_type: 'REVENUE', balance: 400 }),
      row({ account_type: 'REVENUE', balance: 600 }),
    ]

    expect(groupByAccountType(rows)[0].total).toBe(1000)
  })

  it('returns nothing for an empty ledger', () => {
    expect(groupByAccountType([])).toEqual([])
  })
})

describe('canPostAccounting', () => {
  it('permits the roles that handle money', () => {
    expect(canPostAccounting('billing_staff')).toBe(true)
    expect(canPostAccounting('facility_admin')).toBe(true)
    expect(canPostAccounting('super_admin')).toBe(true)
  })

  it('refuses clinical and reception roles', () => {
    expect(canPostAccounting('doctor')).toBe(false)
    expect(canPostAccounting('nurse')).toBe(false)
    expect(canPostAccounting('receptionist')).toBe(false)
    expect(canPostAccounting('pharmacist')).toBe(false)
  })

  it('refuses an absent role rather than defaulting open', () => {
    expect(canPostAccounting(undefined)).toBe(false)
    expect(canPostAccounting(null)).toBe(false)
    expect(canPostAccounting('')).toBe(false)
  })
})

describe('constants', () => {
  it('covers the four account types the chart of accounts uses', () => {
    expect(ACCOUNT_TYPES).toEqual(['ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE'])
  })

  it('excludes insurance from deposit modes — a TPA cannot pay an advance', () => {
    expect(DEPOSIT_MODES).not.toContain('insurance')
  })
})
