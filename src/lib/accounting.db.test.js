import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

// A4 — the assertion the spec asks for: every rule must post a voucher whose
// debits equal its credits.
//
// These run against a real Postgres, not a mock. The rules under test ARE the
// database — a SECURITY DEFINER function that refuses to write an unbalanced
// voucher, a trigger that blocks ledger edits — so a mocked client would only
// assert that the mock behaves like the mock.
//
// The RPCs resolve the facility from auth.uid(), so the suite calls them over
// a genuine user JWT minted from the project's JWT secret, exactly as the
// browser would. The service-role client is used only to seed and read
// fixtures, never to call the functions under test — calling them as
// service-role would skip the membership checks that are half the point.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<anon> \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
//   SUPABASE_JWT_SECRET=<Settings -> API -> JWT Secret> \
//   TEST_FACILITY_ID=<facility uuid> \
//   TEST_STAFF_UID=<auth uid of a facility_admin in that facility> \
//   ALLOW_DB_TESTS=1 \
//   npx vitest run src/lib/accounting.db.test.js
//
// ALLOW_DB_TESTS is a deliberate speed bump. Posted vouchers are immutable by
// design, so this suite cannot fully clean up after itself — point it at a
// Supabase branch or a local `supabase start`, never at production. Without
// the full set of variables it skips loudly rather than passing vacuously.

const {
  SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  SUPABASE_JWT_SECRET: JWT_SECRET, TEST_FACILITY_ID: FACILITY,
  TEST_STAFF_UID: UID, ALLOW_DB_TESTS,
} = process.env

const CONFIGURED = Boolean(
  URL && ANON && SERVICE && JWT_SECRET && FACILITY && UID && ALLOW_DB_TESTS === '1'
)

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// Minimal HS256 signer — the only claims PostgREST and our RLS helpers read
// are `sub` and `role`, so pulling in a JWT library would be overkill.
function mintUserToken(sub, secret, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + ttlSeconds,
  }))
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest())
  return `${header}.${payload}.${sig}`
}

// Everything this suite writes carries this tag, so fixtures are identifiable
// even when a test throws halfway through.
const TAG = `__vitest_${Date.now()}__`

let admin   // service-role: seeds and reads fixtures
let staff   // real user JWT: calls the functions under test
let doctorId
let patientId

const path = (sub) => `facilities/${FACILITY}/${sub}`

async function seedInvoice(id, invoice) {
  const { error } = await admin.from('documents').upsert({
    path: path(`billing/${id}`),
    collection: path('billing'),
    facility_id: FACILITY,
    data: { type: 'invoice', ...invoice },
  }, { onConflict: 'path' })
  if (error) throw error
}

// Reads the posted voucher back out of the ledger and totals its two sides.
async function voucherSides(sourceType, sourceId) {
  const { data, error } = await admin
    .from('documents').select('data')
    .eq('collection', path('accounting/ledger'))
    .eq('data->>sourceType', sourceType)
    .eq('data->>sourceId', sourceId)
  if (error) throw error
  if (!data.length) return null

  const lines = data[0].data.lines || []
  const round = (n) => Math.round(n * 100) / 100
  return {
    voucherNumber: data[0].data.voucherNumber,
    debit: round(lines.reduce((s, l) => s + Number(l.dr || 0), 0)),
    credit: round(lines.reduce((s, l) => s + Number(l.cr || 0), 0)),
    lines,
  }
}

const sideFor = (v, code, side) =>
  v.lines.filter((l) => l.accountCode === code)
    .reduce((s, l) => s + Number(l[side] || 0), 0)
const creditFor = (v, code) => sideFor(v, code, 'cr')
const debitFor = (v, code) => sideFor(v, code, 'dr')

// supabase-js resolves errors rather than throwing, so assertions on rejection
// read better through this.
async function callRpc(fn, args) {
  const { data, error } = await staff.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

describe.skipIf(!CONFIGURED)('accounting engine — every voucher balances', () => {
  beforeAll(async () => {
    admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
    staff = createClient(URL, ANON, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${mintUserToken(UID, JWT_SECRET)}` } },
    })

    const { data: patients } = await admin.from('documents')
      .select('path').eq('collection', path('patients')).limit(1)
    if (!patients?.length) throw new Error('Test facility has no patients to bill')
    patientId = patients[0].path.split('/').pop()

    const { data: docs } = await admin.from('documents')
      .select('path').eq('collection', path('staff'))
      .eq('data->>role', 'doctor').limit(1)
    if (!docs?.length) throw new Error('Test facility has no doctor')
    doctorId = docs[0].path.split('/').pop()
  })

  afterAll(async () => {
    if (!admin) return
    // Invoices and deposits are removable; the ledger is not, by design.
    await admin.from('documents').delete().like('path', `%/billing/${TAG}%`)
  })

  it('record_advance_deposit: Dr 1010 Bank = Cr 2110 Advance Liability', async () => {
    const dep = await callRpc('record_advance_deposit', {
      p_patient_id: patientId, p_amount: 4000, p_mode: 'cash',
    })

    const v = await voucherSides('ADVANCE_DEPOSIT', dep.id)
    expect(v.debit).toBe(v.credit)
    expect(debitFor(v, '1010')).toBe(4000)
    expect(creditFor(v, '2110')).toBe(4000)
    // The whole point of a deposit: money held is not money earned.
    expect(v.lines.some((l) => l.accountCode.startsWith('3'))).toBe(false)
  })

  it('post_opd_invoice_gl: Dr 1010 = Cr 3010 + Cr 3030, split by line item', async () => {
    const id = `${TAG}opd`
    await seedInvoice(id, {
      invoiceNumber: 'INV-TEST-OPD', total: 1000, paidAmount: 1000,
      paymentStatus: 'pending', invoiceDate: Date.now(), patientId,
      lineItems: [
        { source: 'opd', description: 'Consultation', amount: 400 },
        { source: 'lab', description: 'CBC', amount: 600 },
      ],
    })

    await callRpc('post_opd_invoice_gl', { p_invoice_id: id })

    const v = await voucherSides('OPD_INVOICE', id)
    expect(v.debit).toBe(v.credit)
    expect(v.debit).toBe(1000)
    expect(creditFor(v, '3010')).toBe(400)
    expect(creditFor(v, '3030')).toBe(600)
  })

  it('post_opd_invoice_gl: an uneven three-way split still balances to the paise', async () => {
    const id = `${TAG}round`
    await seedInvoice(id, {
      invoiceNumber: 'INV-TEST-ROUND', total: 100, paidAmount: 100,
      paymentStatus: 'pending', invoiceDate: Date.now(), patientId,
      lineItems: [
        { source: 'opd', amount: 1 }, { source: 'lab', amount: 1 },
        { source: 'pharmacy', amount: 1 },
      ],
    })

    await callRpc('post_opd_invoice_gl', { p_invoice_id: id })

    // 100/3 does not divide evenly; one slice absorbs the residue.
    const v = await voucherSides('OPD_INVOICE', id)
    expect(v.debit).toBe(v.credit)
    expect(v.credit).toBe(100)
  })

  it('post_opd_invoice_gl: posts nothing until money is actually received', async () => {
    const id = `${TAG}unpaid`
    await seedInvoice(id, {
      invoiceNumber: 'INV-TEST-UNPAID', total: 500, paidAmount: 0,
      paymentStatus: 'pending', invoiceDate: Date.now(), patientId,
      lineItems: [{ source: 'opd', amount: 500 }],
    })

    const res = await callRpc('post_opd_invoice_gl', { p_invoice_id: id })

    expect(res.posted).toBe(false)
    expect(await voucherSides('OPD_INVOICE', id)).toBeNull()
  })

  it('post_opd_invoice_gl: re-posting the same invoice does not double revenue', async () => {
    const id = `${TAG}opd`

    const res = await callRpc('post_opd_invoice_gl', { p_invoice_id: id })

    expect(res.alreadyPosted).toBe(true)
    expect((await voucherSides('OPD_INVOICE', id)).credit).toBe(1000)
  })

  it('settle_ipd_discharge_gl: advance is consumed before cash, and it balances', async () => {
    const id = `${TAG}ipd`
    await seedInvoice(id, {
      invoiceNumber: 'INV-TEST-IPD', total: 10000, paidAmount: 10000,
      paymentStatus: 'pending', invoiceDate: Date.now(), patientId,
      lineItems: [
        { source: 'ipd', amount: 6000 },
        { source: 'ot', amount: 3000 },
        { source: 'pharmacy', amount: 1000 },
      ],
    })

    await callRpc('settle_ipd_discharge_gl', {
      p_admission_id: `${TAG}adm`, p_invoice_id: id,
    })

    const v = await voucherSides('IPD_DISCHARGE', `${TAG}adm`)
    expect(v.debit).toBe(v.credit)
    expect(v.debit).toBe(10000)
    // The 4000 deposited in the first test is spent before any cash is taken.
    expect(debitFor(v, '2110')).toBe(4000)
    expect(debitFor(v, '1010')).toBe(6000)
    expect(creditFor(v, '3050')).toBe(6000)
    expect(creditFor(v, '3060')).toBe(3000)
    expect(creditFor(v, '3070')).toBe(1000)
  })

  it('settle_tpa_claim_gl: net + TDS + disallowed clears the receivable exactly', async () => {
    const id = `${TAG}tpa`
    await seedInvoice(id, {
      invoiceNumber: 'INV-TEST-TPA', total: 50000, paidAmount: 0,
      paymentStatus: 'pending', invoiceDate: Date.now(), patientId,
      insuranceClaim: { claimNumber: 'CLM-TEST', claimAmount: 50000 },
      lineItems: [{ source: 'ipd', amount: 50000 }],
    })

    await callRpc('settle_tpa_claim_gl', {
      p_invoice_id: id, p_net_received: 44000,
      p_tds_amount: 1000, p_disallowed_amount: 5000,
    })

    const v = await voucherSides('TPA_SETTLEMENT', id)
    expect(v.debit).toBe(v.credit)
    expect(debitFor(v, '1010')).toBe(44000)
    expect(debitFor(v, '1310')).toBe(1000)
    expect(debitFor(v, '4210')).toBe(5000)
    expect(creditFor(v, '1210')).toBe(50000)
  })

  it('settle_tpa_claim_gl: refuses a settlement that does not add up to the claim', async () => {
    const id = `${TAG}tpabad`
    await seedInvoice(id, {
      invoiceNumber: 'INV-TEST-TPA-BAD', total: 1000, paidAmount: 0,
      paymentStatus: 'pending', invoiceDate: Date.now(), patientId,
      insuranceClaim: { claimNumber: 'CLM-BAD', claimAmount: 1000 },
      lineItems: [{ source: 'ipd', amount: 1000 }],
    })

    await expect(callRpc('settle_tpa_claim_gl', {
      p_invoice_id: id, p_net_received: 500,
      p_tds_amount: 100, p_disallowed_amount: 100,
    })).rejects.toThrow(/CLAIM_MISMATCH/)

    // A rejected settlement must leave the receivable untouched.
    expect(await voucherSides('TPA_SETTLEMENT', id)).toBeNull()
  })

  it('accrue_doctor_revenue_share_gl: Dr 4010 Expense = Cr 2210 Payable', async () => {
    const { data: before } = await admin.from('documents')
      .select('data').eq('path', path(`staff/${doctorId}`)).single()
    await admin.from('documents')
      .update({ data: { ...before.data, revenueSharePercent: 30 } })
      .eq('path', path(`staff/${doctorId}`))

    try {
      await callRpc('accrue_doctor_revenue_share_gl', {
        p_invoice_id: `${TAG}opd`, p_doctor_id: doctorId,
      })

      const v = await voucherSides('DOCTOR_SHARE', `${TAG}opd:${doctorId}`)
      expect(v.debit).toBe(v.credit)
      expect(debitFor(v, '4010')).toBe(300)   // 30% of the 1000 invoice
      expect(creditFor(v, '2210')).toBe(300)
    } finally {
      await admin.from('documents')
        .update({ data: before.data }).eq('path', path(`staff/${doctorId}`))
    }
  })

  it('accrue_doctor_revenue_share_gl: a salaried doctor accrues nothing, without erroring', async () => {
    const res = await callRpc('accrue_doctor_revenue_share_gl', {
      p_invoice_id: `${TAG}round`, p_doctor_id: doctorId,
    })

    expect(res.posted).toBe(false)
    expect(res.reason).toBe('NO_REVENUE_SHARE_CONFIGURED')
  })

  it('the ledger holds no unbalanced voucher at all', async () => {
    const { data, error } = await admin.from('v_voucher_balance_check').select('*')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('a posted voucher cannot be edited', async () => {
    const { data: row } = await admin.from('documents')
      .select('path').eq('collection', path('accounting/ledger')).limit(1).single()

    const { error } = await admin.from('documents')
      .update({ data: { amount: 1 } }).eq('path', row.path)

    expect(error?.message || '').toMatch(/LEDGER_IMMUTABLE/)
  })

  it('a posted voucher cannot be deleted', async () => {
    const { data: row } = await admin.from('documents')
      .select('path').eq('collection', path('accounting/ledger')).limit(1).single()

    const { error } = await admin.from('documents').delete().eq('path', row.path)

    expect(error?.message || '').toMatch(/LEDGER_IMMUTABLE/)
  })
})

describe.skipIf(CONFIGURED)('accounting engine (database suite)', () => {
  it('is skipped without service-role credentials', () => {
    console.warn(
      '\n  Ledger DB tests skipped. They need SUPABASE_URL, SUPABASE_ANON_KEY,\n'
      + '  SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, TEST_FACILITY_ID,\n'
      + '  TEST_STAFF_UID and ALLOW_DB_TESTS=1.\n'
      + '  See the header of src/lib/accounting.db.test.js. Point them at a\n'
      + '  Supabase branch or local stack — never production.\n'
    )
    expect(CONFIGURED).toBe(false)
  })
})
