import { useState, useEffect } from 'react'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import { usePermission } from '@hooks/usePermission'
import InventoryTab from './InventoryTab'
import DispenseTab from './DispenseTab'
import PurchasesTab from './PurchasesTab'
import StockReportTab from './StockReportTab'
import { Pill, PackageOpen, ShoppingCart, BarChart2 } from 'lucide-react'

const TABS = [
  { key: 'inventory', label: 'Inventory', icon: Pill },
  { key: 'dispense', label: 'Dispense', icon: PackageOpen },
  { key: 'purchases', label: 'Purchases', icon: ShoppingCart },
  { key: 'report', label: 'Stock Report', icon: BarChart2 },
]

export default function PharmacyPage() {
  const { facilityId } = useFacility()
  const { can } = usePermission()
  const [tab, setTab] = useState('inventory')
  const [medicines, setMedicines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    return subscribeToCollection(`facilities/${facilityId}/pharmacy/medicines`, (data) => {
      setMedicines(data.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setLoading(false)
    })
  }, [facilityId])

  const canWrite = can('pharmacy', 'create') || can('pharmacy', 'update')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><Pill size={22} /> Pharmacy</h2>
          <p>{medicines.length} medicine{medicines.length !== 1 ? 's' : ''} in inventory</p>
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
        <div className="empty-state">Loading pharmacy data...</div>
      ) : (
        <>
          {tab === 'inventory' && <InventoryTab medicines={medicines} canWrite={canWrite} />}
          {tab === 'dispense' && <DispenseTab medicines={medicines} canWrite={canWrite} />}
          {tab === 'purchases' && <PurchasesTab medicines={medicines} canWrite={canWrite} />}
          {tab === 'report' && <StockReportTab medicines={medicines} />}
        </>
      )}
    </div>
  )
}
