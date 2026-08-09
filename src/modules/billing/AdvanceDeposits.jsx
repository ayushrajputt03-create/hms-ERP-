import { useState, useEffect, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { subscribeToCollection } from '@lib/db'
import { recordAdvanceDeposit, DEPOSIT_MODES, DEPOSIT_MODE_LABELS, canPostAccounting } from '@lib/accounting'
import { searchPatients } from '@lib/patients'
import { buildAdvanceDepositReceiptPDF, printPDF } from '@lib/pdf'
import { formatINR, formatDate } from '@lib/utils'
import StatCard from '@components/StatCard'
import { Wallet, Printer, Loader, Search, IndianRupee } from 'lucide-react'

// Counter screen for money taken before treatment.
//
// A deposit is a liability, not a sale — it is booked Dr Cash / Cr Advance
// Deposit Liability and only becomes revenue when a discharge bill consumes
// it. The balance column is therefore the number that matters here, not the
// amount originally taken.
export default function AdvanceDeposits() {
  const { facilityId, facilityConfig } = useFacility()
  const { staffProfile } = useAuth()
  const allowed = canPostAccounting(staffProfile?.role)

  const [deposits, setDeposits] = useState([])
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [patient, setPatient] = useState(null)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!facilityId) return
    return subscribeToCollection(`facilities/${facilityId}/accounting/deposits`, setDeposits)
  }, [facilityId])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || patient) { setMatches([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        setMatches(await searchPatients(q, 8))
      } catch (err) {
        console.error('Patient search error:', err)
        setMatches([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, patient])

  const outstanding = useMemo(
    () => deposits.reduce((s, d) => s + (Number(d.balanceRemaining) || 0), 0),
    [deposits]
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!patient) { setError('Select a patient first.'); return }
    if (!Number.isFinite(amt) || amt <= 0) { setError('Enter a deposit amount greater than zero.'); return }
    setSaving(true)
    setError('')
    try {
      const dep = await recordAdvanceDeposit({ patientId: patient.id, amount: amt, mode })
      // Print straight away — the patient is standing at the counter waiting
      // for the receipt, so making them click twice serves nobody.
      handlePrint(dep, patient)
      setPatient(null); setQuery(''); setAmount('')
    } catch (err) {
      console.error('Deposit error:', err)
      setError(err?.message || 'Could not record the deposit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = (dep, pt) => {
    try {
      const pdf = buildAdvanceDepositReceiptPDF({
        facility: facilityConfig || {},
        patient: pt || { name: dep.patientName, uhid: dep.patientUhid },
        deposit: dep,
        ledger: [{ date: dep.createdAt, description: 'Advance deposit received', credit: dep.amount, debit: 0 },
          ...(Number(dep.amount) - Number(dep.balanceRemaining) > 0
            ? [{
                date: dep.updatedAt,
                description: 'Adjusted against bill',
                credit: 0,
                debit: Number(dep.amount) - Number(dep.balanceRemaining),
              }]
            : [])],
      })
      printPDF(pdf)
    } catch (err) {
      console.error('Receipt print error:', err)
      setError('Failed to prepare the receipt for printing.')
    }
  }

  if (!allowed) {
    return <div className="empty-state"><p>You do not have permission to view advance deposits.</p></div>
  }

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={Wallet} label="On Deposit" value={formatINR(outstanding)}
          sub="refundable liability" color="amber" />
        <StatCard icon={IndianRupee} label="Deposits Taken" value={deposits.length}
          sub="receipts issued" color="teal" />
      </div>

      <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
        <h3><Wallet size={17} /> Take Advance Deposit</h3>
        <form onSubmit={handleSubmit}>
          {patient ? (
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Patient</label>
                <div className="selected-patient">
                  <strong>{patient.name}</strong>
                  <span className="font-mono uhid-display">{patient.uhid || 'No UHID'}</span>
                  <button type="button" className="btn btn-outline btn-sm"
                    onClick={() => { setPatient(null); setQuery('') }}>Change</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label><Search size={13} /> Patient</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, mobile number or UHID..." />
              {searching && <Loader size={14} className="spin" />}
              {matches.length > 0 && (
                <div className="patient-search-results">
                  {matches.map((p) => (
                    <button type="button" key={p.id} className="patient-search-row deposit-pick"
                      onClick={() => { setPatient(p); setMatches([]) }}>
                      <span><strong>{p.name}</strong> <span className="font-mono">{p.uhid}</span></span>
                      <span className="text-muted">{p.phone || '—'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label><IndianRupee size={13} /> Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal" placeholder="e.g. 5000" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {DEPOSIT_MODES.map((m) => (
                  <option key={m} value={m}>{DEPOSIT_MODE_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <Loader size={14} className="spin" /> : <Printer size={14} />}
                Record &amp; Print Receipt
              </button>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}
        </form>
      </div>

      <div className="settings-section">
        <h3>Deposits</h3>
        {deposits.length === 0 ? (
          <p className="text-muted">No advance deposits recorded yet.</p>
        ) : (
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt</th><th>Patient</th><th>UHID</th><th>Date</th>
                  <th>Mode</th><th>Amount</th><th>Balance</th><th></th>
                </tr>
              </thead>
              <tbody>
                {deposits
                  .slice()
                  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                  .map((d) => (
                    <tr key={d.id}>
                      <td className="font-mono">{d.receiptNumber}</td>
                      <td>{d.patientName}</td>
                      <td className="font-mono">{d.patientUhid}</td>
                      <td>{formatDate(d.createdAt, 'date')}</td>
                      <td>{DEPOSIT_MODE_LABELS[d.depositMode] || d.depositMode}</td>
                      <td>{formatINR(d.amount)}</td>
                      <td>
                        <span className={`badge badge-${Number(d.balanceRemaining) > 0 ? 'success' : 'muted'}`}>
                          {formatINR(d.balanceRemaining)}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => handlePrint(d)}>
                          <Printer size={13} /> Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
