import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument } from '@lib/db'
import { formatINR } from '@lib/utils'
import { ROLES } from '@lib/constants'
import { useToast } from '@components/Toast'
import { IndianRupee, Save, Info } from 'lucide-react'

// Consultation fees, one row per doctor plus a facility-default row.
// The server resolves the fee at End Visit from exactly this data, so what an
// admin sets here is what the patient is actually billed.
export default function TariffMaster() {
  const { facilityId } = useFacility()
  const { user, staffProfile } = useAuth()
  const toast = useToast()

  const [tariffs, setTariffs] = useState([])
  const [staff, setStaff] = useState([])
  const [drafts, setDrafts] = useState({})
  const [savingKey, setSavingKey] = useState(null)

  useEffect(() => {
    if (!facilityId) return
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/tariffMaster`, setTariffs),
      subscribeToCollection(`facilities/${facilityId}/staff`, setStaff),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const doctors = useMemo(
    () => staff.filter((s) => s.role === ROLES.DOCTOR && s.status !== 'inactive'),
    [staff]
  )

  const consultTariffs = useMemo(
    () => tariffs.filter((t) => t.category === 'consultation'),
    [tariffs]
  )

  const tariffFor = (doctorId) =>
    consultTariffs.find((t) =>
      doctorId ? t.doctorId === doctorId : !t.doctorId
    ) || null

  const defaultAmount = tariffFor(null)?.amount

  const save = async (doctorId, key) => {
    const raw = drafts[key]
    const amount = Number(raw)
    if (raw === '' || raw == null) { toast.error('Enter an amount.'); return }
    if (!Number.isFinite(amount) || amount < 0) { toast.error('Enter a valid amount.'); return }

    setSavingKey(key)
    const existing = tariffFor(doctorId)
    const auditCtx = {
      user: staffProfile?.name || user?.email,
      facilityId,
      audit: { action: 'tariff_updated', module: 'admin' },
    }

    try {
      if (existing) {
        await updateDocument(`facilities/${facilityId}/tariffMaster/${existing.id}`,
          { amount, status: 'active' }, auditCtx)
      } else {
        await addDocument(`facilities/${facilityId}/tariffMaster`, {
          category: 'consultation',
          status: 'active',
          amount,
          doctorId: doctorId || null,
        }, auditCtx)
      }
      setDrafts((d) => { const n = { ...d }; delete n[key]; return n })
      toast.success('Tariff saved.')
    } catch (err) {
      console.error('Tariff save error:', err)
      toast.error('Failed to save tariff.')
    } finally {
      setSavingKey(null)
    }
  }

  const rows = [
    { key: 'default', doctorId: null, label: 'Facility default', sub: 'Used when a doctor has no own fee' },
    ...doctors.map((d) => ({
      key: d.id,
      doctorId: d.id,
      label: `Dr. ${d.name}`,
      sub: d.department || '',
    })),
  ]

  return (
    <div className="settings-section">
      <div className="settings-hint">
        <Info size={14} />
        <span>
          These fees are applied by the server when a doctor ends a visit. A doctor with
          no own fee falls back to the facility default.
        </span>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Doctor</th>
            <th>Current fee</th>
            <th style={{ width: 180 }}>New fee (₹)</th>
            <th style={{ width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const current = tariffFor(row.doctorId)?.amount
            const inherits = row.doctorId && current == null
            const draft = drafts[row.key]
            return (
              <tr key={row.key}>
                <td>
                  <strong>{row.label}</strong>
                  {row.sub && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{row.sub}</div>}
                </td>
                <td>
                  {current != null
                    ? formatINR(current)
                    : inherits
                      ? <span className="text-muted">
                          inherits default{defaultAmount != null ? ` (${formatINR(defaultAmount)})` : ''}
                        </span>
                      : <span className="text-muted">not set</span>}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    placeholder={current != null ? String(current) : '—'}
                    value={draft ?? ''}
                    onChange={(e) => setDrafts({ ...drafts, [row.key]: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={draft == null || draft === '' || savingKey === row.key}
                    onClick={() => save(row.doctorId, row.key)}
                  >
                    <Save size={13} /> {savingKey === row.key ? '…' : 'Save'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {doctors.length === 0 && (
        <p className="text-muted" style={{ marginTop: '0.75rem' }}>
          No active doctors yet. Add doctors under Staff Management to set per-doctor fees.
        </p>
      )}

      {defaultAmount == null && (
        <div className="auth-error" style={{ marginTop: '0.75rem' }}>
          <IndianRupee size={13} /> No facility default set — visits for doctors without
          their own fee will be billed ₹0 until you set one.
        </div>
      )}
    </div>
  )
}
