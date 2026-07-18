import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { updateDocument } from '@lib/db'
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
      await updateDocument(`facilities/${facilityId}/billing/${inv.id}`, {
        insuranceClaim: { ...inv.insuranceClaim, ...patch },
      }, {
        user: staffProfile?.name || user?.email, facilityId,
        audit: { action: 'tpa_claim_updated', module: 'billing' },
      })
    } catch (err) {
      console.error(err)
      toast.error('Failed to update claim.')
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
            <div className="claim-body">
              <div className="form-group">
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
              <div className="form-group" style={{ flex: 1 }}>
                <label>Notes</label>
                <input
                  defaultValue={c.notes || ''}
                  placeholder="Claim ref no., remarks…"
                  disabled={saving === inv.id}
                  onBlur={(e) => { if (e.target.value !== (c.notes || '')) updateClaim(inv, { notes: e.target.value }) }}
                />
              </div>
              <div className="claim-date text-muted">{formatDate(inv.invoiceDate)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
