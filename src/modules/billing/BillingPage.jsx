import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import { canBill } from '@lib/billing'
import { formatINR, formatDate } from '@lib/utils'
import BillBuilder from './BillBuilder'
import TpaTracker from './TpaTracker'
import CollectionReport from './CollectionReport'
import AdvanceDeposits from './AdvanceDeposits'
import { Receipt, FilePlus, FileText, ShieldCheck, BarChart2, Wallet } from 'lucide-react'

export default function BillingPage() {
  const navigate = useNavigate()
  const { staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()
  const role = staffProfile?.role
  const mayBill = canBill(role)
  const tpaEnabled = !!facilityConfig?.tpaEnabled

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(mayBill ? 'builder' : 'invoices')

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    return subscribeToCollection(`facilities/${facilityId}/billing`, (data) => {
      setInvoices(data
        .filter((d) => d.type === 'invoice')
        .sort((a, b) => (b.invoiceDate || 0) - (a.invoiceDate || 0)))
      setLoading(false)
    })
  }, [facilityId])

  const TABS = [
    mayBill && { key: 'builder', label: 'Bill Builder', icon: FilePlus },
    { key: 'invoices', label: 'Invoices', icon: FileText },
    tpaEnabled && { key: 'tpa', label: 'TPA Claims', icon: ShieldCheck },
    mayBill && { key: 'deposits', label: 'Advance Deposits', icon: Wallet },
    mayBill && { key: 'report', label: 'Daily Report', icon: BarChart2 },
  ].filter(Boolean)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><Receipt size={22} /> Billing &amp; Invoicing</h2>
          <p>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}{!mayBill && ' — read-only'}</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'builder' && mayBill && <BillBuilder />}
      {tab === 'invoices' && (
        loading ? <div className="empty-state">Loading…</div>
          : <InvoiceList invoices={invoices} onOpen={(id) => navigate(`/billing/invoice/${id}`)} />
      )}
      {tab === 'tpa' && tpaEnabled && <TpaTracker invoices={invoices} />}
      {tab === 'deposits' && mayBill && <AdvanceDeposits />}
      {tab === 'report' && mayBill && <CollectionReport invoices={invoices} />}
    </div>
  )
}

function InvoiceList({ invoices, onOpen }) {
  if (invoices.length === 0) {
    return <div className="empty-state">No invoices yet. Generate one from the Bill Builder.</div>
  }
  return (
    <div className="queue-list">
      {invoices.map((inv) => {
        const cancelled = inv.paymentStatus === 'cancelled'
        const paid = inv.paymentStatus === 'paid'
        const partial = inv.paymentStatus === 'partially_paid'
        return (
          <div key={inv.id} className="queue-card" style={{ cursor: 'pointer' }} onClick={() => onOpen(inv.id)}>
            <div className="queue-patient-info">
              <div className="queue-patient-name">
                <span className="font-mono">{inv.invoiceNumber}</span> — {inv.patientName}
              </div>
              <div className="queue-patient-meta">
                {formatDate(inv.invoiceDate, 'datetime')} — {(inv.lineItems || []).length} item{(inv.lineItems || []).length !== 1 ? 's' : ''}
              </div>
            </div>
            <strong>{formatINR(inv.total ?? inv.grandTotal)}</strong>
            <span className={`badge ${cancelled ? 'badge-danger' : paid ? 'badge-success' : 'badge-warning'}`}>
              {cancelled ? 'Cancelled' : paid ? 'Paid' : partial ? 'Partially Paid' : (inv.paymentStatus || 'Pending')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
