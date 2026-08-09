import { useState, useEffect, useMemo } from 'react'
import {
  settleTpaClaim, accrueDoctorShare, getPostedSources,
} from '@lib/accounting'
import { formatINR, formatDate } from '@lib/utils'
import { Loader, ShieldCheck, UserCheck, CheckCircle } from 'lucide-react'

// Insurance settlements and doctor revenue share.
//
// Both postings already existed as RPCs with no way to reach them. That is the
// worst state for an accounting feature: the ledger looks tidy because the
// entries nobody can make are the ones that never appear. A TPA claim raised
// and never settled leaves 1210 Receivable overstated forever, and a
// consultant's share never accrued understates cost every single month.
//
// Neither posting is inferable from an invoice alone — what the insurer
// actually paid arrives weeks later on a remittance advice, and which doctor
// earns on a bill is a decision, not a field. So both are deliberately manual.

const money = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function SettlementsTab({ invoices, staff }) {
  const [settled, setSettled] = useState(new Set())
  const [shared, setShared] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const refresh = () => {
    setLoadError('')
    return Promise.all([getPostedSources('TPA_SETTLEMENT'), getPostedSources('DOCTOR_SHARE')])
      .then(([t, d]) => { setSettled(t); setShared(d) })
      .catch((err) => {
        console.error('Settlement status error:', err)
        setLoadError('Could not read what has already been posted.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  // A claim only exists where billing recorded one. Falling back to "every
  // unpaid invoice" would invite settling a plain cash bill as insurance.
  const claims = useMemo(
    () => invoices
      .filter((i) => i.insuranceClaim && money(i.insuranceClaim.claimAmount ?? i.total) > 0)
      .sort((a, b) => (b.invoiceDate || 0) - (a.invoiceDate || 0)),
    [invoices]
  )

  const shareDoctors = useMemo(
    () => staff.filter((s) => s.role === 'doctor' && money(s.revenueSharePercent) > 0),
    [staff]
  )

  if (loading) return <div className="empty-state">Loading settlements…</div>

  return (
    <div>
      {loadError && <div className="auth-error">{loadError}</div>}

      <TpaSection claims={claims} settled={settled} onPosted={refresh} />
      <DoctorShareSection
        invoices={invoices} doctors={shareDoctors} shared={shared} onPosted={refresh}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function TpaSection({ claims, settled, onPosted }) {
  const [open, setOpen] = useState(null)

  return (
    <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
      <h3><ShieldCheck size={17} /> Insurance / TPA Settlements</h3>
      <p className="settings-hint">
        Enter the remittance exactly as the insurer sent it. The net received,
        TDS deducted and amount disallowed must together equal the claim — a
        short settlement that does not add up is refused rather than left to
        quietly clear the receivable.
      </p>

      {claims.length === 0 ? (
        <p className="text-muted">No insurance claims raised yet.</p>
      ) : (
        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th><th>Patient</th><th>Claim No.</th>
                <th>Claim Amount</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((inv) => {
                const done = settled.has(inv.id)
                const claimAmount = money(inv.insuranceClaim.claimAmount ?? inv.total)
                return (
                  <tr key={inv.id}>
                    <td className="font-mono">{inv.invoiceNumber || inv.id}</td>
                    <td>{inv.patientName || '—'}</td>
                    <td>{inv.insuranceClaim.claimNumber || '—'}</td>
                    <td>{formatINR(claimAmount)}</td>
                    <td>{inv.invoiceDate ? formatDate(inv.invoiceDate, 'date') : '—'}</td>
                    <td>
                      {done ? (
                        <span className="badge badge-success">
                          <CheckCircle size={12} /> Settled
                        </span>
                      ) : (
                        <button className="btn btn-outline btn-sm"
                          onClick={() => setOpen(open === inv.id ? null : inv.id)}>
                          {open === inv.id ? 'Cancel' : 'Settle'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <SettleForm
          invoice={claims.find((c) => c.id === open)}
          onDone={() => { setOpen(null); onPosted() }}
        />
      )}
    </div>
  )
}

function SettleForm({ invoice, onDone }) {
  const claimAmount = money(invoice.insuranceClaim.claimAmount ?? invoice.total)
  const [form, setForm] = useState({ net: String(claimAmount), tds: '0', disallowed: '0' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const net = money(form.net)
  const tds = money(form.tds)
  const disallowed = money(form.disallowed)
  const entered = net + tds + disallowed
  // Compared at paise. The server applies the same rule and is the authority;
  // showing the gap here just saves a round trip to be told it is wrong.
  const gap = Math.round((entered - claimAmount) * 100) / 100
  const balances = gap === 0

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await settleTpaClaim({
        invoiceId: invoice.id,
        netReceived: net,
        tdsAmount: tds,
        disallowedAmount: disallowed,
      })
      onDone()
    } catch (err) {
      console.error('TPA settlement error:', err)
      setError(
        String(err?.message || '').includes('CLAIM_MISMATCH')
          ? 'The three amounts do not add up to the claim.'
          : String(err?.message || '').includes('ROLE_NOT_PERMITTED')
            ? 'Your role cannot settle claims.'
            : 'Could not post the settlement.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: '1rem' }}>
      <h4>Settle {invoice.invoiceNumber || invoice.id} — claim {formatINR(claimAmount)}</h4>
      <div className="form-row">
        <div className="form-group">
          <label>Net Received *</label>
          <input type="number" step="0.01" min="0" value={form.net} onChange={set('net')} />
        </div>
        <div className="form-group">
          <label>TDS Deducted</label>
          <input type="number" step="0.01" min="0" value={form.tds} onChange={set('tds')} />
        </div>
        <div className="form-group">
          <label>Disallowed / Written Off</label>
          <input type="number" step="0.01" min="0" value={form.disallowed} onChange={set('disallowed')} />
        </div>
      </div>

      <div className={`ledger-tieout ${balances ? 'ok' : 'bad'}`}>
        {balances
          ? `Adds up to the claim — ${formatINR(claimAmount)}.`
          : `Out by ${formatINR(Math.abs(gap))} — entered ${formatINR(entered)} against a claim of ${formatINR(claimAmount)}.`}
      </div>

      {error && <div className="auth-error">{error}</div>}

      <button className="btn btn-primary" disabled={saving || !balances}>
        {saving ? <><Loader size={14} className="spin" /> Posting…</> : 'Post Settlement'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------

function DoctorShareSection({ invoices, doctors, shared, onPosted }) {
  const [doctorId, setDoctorId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const doctor = doctors.find((d) => d.id === doctorId)
  const invoice = invoices.find((i) => i.id === invoiceId)
  const base = invoice ? money(invoice.total ?? invoice.grandTotal) : 0
  const pct = doctor ? money(doctor.revenueSharePercent) : 0
  const amount = Math.round(base * pct) / 100

  // Keyed by invoice AND doctor server-side, so the same bill can carry a
  // share for two consultants without one blocking the other.
  const alreadyPosted = invoiceId && doctorId && shared.has(`${invoiceId}:${doctorId}`)

  const paidInvoices = useMemo(
    () => invoices
      .filter((i) => i.paymentStatus === 'paid')
      .sort((a, b) => (b.invoiceDate || 0) - (a.invoiceDate || 0))
      .slice(0, 100),
    [invoices]
  )

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setOk('')
    try {
      const res = await accrueDoctorShare({ invoiceId, doctorId })
      if (res?.posted === false) {
        setError(res.reason === 'ZERO_SHARE_AMOUNT'
          ? 'That share works out to zero on this invoice.'
          : 'This doctor has no revenue share configured.')
      } else if (res?.alreadyPosted) {
        setOk('Already accrued for this doctor on this invoice.')
      } else {
        setOk(`Accrued ${formatINR(amount)} — voucher ${res?.voucherNumber || 'posted'}.`)
      }
      onPosted()
    } catch (err) {
      console.error('Doctor share error:', err)
      setError('Could not accrue the share.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-section">
      <h3><UserCheck size={17} /> Doctor Revenue Share</h3>
      <p className="settings-hint">
        Books the consultant&rsquo;s cut as an expense and a payable at the
        percentage set on their staff record. Salaried doctors do not appear
        here — only staff with a revenue share configured.
      </p>

      {doctors.length === 0 ? (
        <p className="text-muted">
          No doctor has a revenue share percentage set. Add one on the staff record first.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Doctor *</label>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">Select doctor…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {money(d.revenueSharePercent)}%
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Paid Invoice *</label>
              <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">Select invoice…</option>
                {paidInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNumber || i.id} — {i.patientName || 'patient'} — {formatINR(i.total ?? i.grandTotal)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {doctor && invoice && (
            <p className="settings-hint">
              {pct}% of {formatINR(base)} = <strong>{formatINR(amount)}</strong>
              {alreadyPosted && ' — already accrued.'}
            </p>
          )}

          {error && <div className="auth-error">{error}</div>}
          {ok && <div className="ledger-tieout ok">{ok}</div>}

          <button className="btn btn-primary"
            disabled={saving || !doctorId || !invoiceId || alreadyPosted}>
            {saving ? <><Loader size={14} className="spin" /> Posting…</> : 'Accrue Share'}
          </button>
        </form>
      )}
    </div>
  )
}
