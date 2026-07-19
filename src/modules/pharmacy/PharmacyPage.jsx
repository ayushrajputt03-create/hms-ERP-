import { useState, useEffect } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { subscribeToCollection } from '@lib/db'
import { canDispense, pharmacyAlertCount } from '@lib/pharmacy'
import InventoryTab from './InventoryTab'
import DispenseTab from './DispenseTab'
import StockInTab from './StockInTab'
import SalesTab from './SalesTab'
import { Pill, PackageOpen, PackagePlus, ReceiptText, AlertTriangle, CalendarX } from 'lucide-react'

export default function PharmacyPage() {
  const { facilityId } = useFacility()
  const { staffProfile } = useAuth()
  const canWrite = canDispense(staffProfile?.role)

  const [medicines, setMedicines] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('inventory')

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/pharmacy/medicines`, (d) => {
        setMedicines(d.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
        setLoading(false)
      }),
      subscribeToCollection(`facilities/${facilityId}/pharmacy/batches`, setBatches),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const alerts = pharmacyAlertCount(medicines, batches)

  const TABS = [
    { key: 'inventory', label: 'Inventory', icon: Pill },
    canWrite && { key: 'dispense', label: 'Dispense', icon: PackageOpen },
    canWrite && { key: 'stockin', label: 'Stock-in', icon: PackagePlus },
    { key: 'sales', label: 'Sales', icon: ReceiptText },
  ].filter(Boolean)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><Pill size={22} /> Pharmacy</h2>
          <p>{medicines.length} medicine{medicines.length !== 1 ? 's' : ''} · {batches.length} batch{batches.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="pharmacy-alerts">
          {alerts.lowStock > 0 && (
            <span className="badge badge-danger"><AlertTriangle size={12} /> {alerts.lowStock} low stock</span>
          )}
          {alerts.nearExpiry > 0 && (
            <span className="badge badge-warning"><CalendarX size={12} /> {alerts.nearExpiry} near expiry</span>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">Loading pharmacy…</div>
      ) : (
        <>
          {tab === 'inventory' && <InventoryTab medicines={medicines} batches={batches} canWrite={canWrite} />}
          {tab === 'dispense' && canWrite && <DispenseTab medicines={medicines} batches={batches} />}
          {tab === 'stockin' && canWrite && <StockInTab medicines={medicines} />}
          {tab === 'sales' && <SalesTab />}
        </>
      )}
    </div>
  )
}
