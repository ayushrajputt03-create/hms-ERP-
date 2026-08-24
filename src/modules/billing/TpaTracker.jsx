import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { updateInsuranceClaimStatus } from '@lib/billing'
import { formatINR, formatDate } from '@lib/utils'
import { useToast } from '@components/Toast'
import { ShieldCheck } from 'lucide-react'

const CLAIM_STATUSES = ['submitted', 'approved', 'rejected', 'paid']
const STATUS_LABELS = { submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', paid: 'Paid' }
const STATUS_BADGE = { submitted: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', paid: 'badge-success' }

export default function TpaTracker({ invoices }) {
  const navigate = useNavigate()
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const toast = useToast()
  const [saving, setSaving] = useState(null)

  const claims = invoices.filter((inv) => inv.insuranceClaim)

  const updateClaim = async (inv, patch) => {
    setSaving(inv.id)
    try {
      await updateInsuranceClaimStatus({
        path: `facilities/${facilityId}/billing/${inv.id}`,
        status: patch.status !== undefined ? patch.status : inv.insuranceClaim.status,
        approvedAmount: patch.approvedAmount !== undefined ? Number(patch.approvedAmount) : (inv.insuranceClaim.approvedAmount || null),
        remarks: patch.notes !== undefined ? patch.notes : (inv.insuranceClaim.notes || null),
      })
      toast.success('Insurance claim updated.')
    } catch (err) {
      console.error('TPA update error:', err)
      toast.error(`Failed to update claim: ${err.message || err}`)
    } finally {
      setSaving(null)
    }
  }

  if (claims.length === 0) {
    return <div className="empty-state">No insurance / TPA claims yet. Invoices billed with the "Insurance / TPA" payment mode appear here.</div>
  }

  return (
    <div className="claims-list">
      {claims.map((inv) => {
        const c = inv.insuranceClaim
        return (
          <div key={inv.id} className="claim-card">
            <div className="claim-head">
              <div>
                <ShieldCheck size={15} />{' '}
                <strong>{c.tpaName || 'TPA'}</strong>
                <span className="text-muted"> — {inv.patientName} ({formatINR(inv.total ?? inv.grandTotal)})</span>
              </div>
              <button className="font-mono btn btn-outline btn-sm" onClick={() => navigate(`/billing/invoice/${inv.id}`)}>
                {inv.invoiceNumber}
              </button>
            </div>
            <div className="claim-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ minWidth: 120 }}>
                <label>Status</label>
                <select
                  value={c.status || 'submitted'}
                  disabled={saving === inv.id}
                  onChange={(e) => updateClaim(inv, { status: e.target.value })}
                >
                  {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <span className={`badge ${STATUS_BADGE[c.status] || 'badge-muted'}`} style={{ marginTop: '0.35rem' }}>
                  {STATUS_LABELS[c.status] || c.status}
                </span>
              </div>
              {['approved', 'paid'].includes(c.status) && (
                <div className="form-group" style={{ minWidth: 140 }}>
                  <label>Approved Amount</label>
                  <input
                    type="number"
                    defaultValue={c.approvedAmount || ''}
                    placeholder="Approved ₹"
                    disabled={saving === inv.id}
                    onBlur={(e) => {
                      const val = e.target.value !== '' ? Number(e.target.value) : null
                      if (val !== c.approvedAmount) {
                        updateClaim(inv, { approvedAmount: val })
                      }
                    }}
                  />
                </div>
              )}
              <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                <label>Notes</label>
                <input
                  defaultValue={c.notes || ''}
                  placeholder="Claim ref no., remarks…"
                  disabled={saving === inv.id}
                  onBlur={(e) => { if (e.target.value !== (c.notes || '')) updateClaim(inv, { notes: e.target.value }) }}
                />
              </div>
              <div className="claim-date text-muted" style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                {formatDate(inv.invoiceDate)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
