import { useState, useEffect } from 'react'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import { subscribeToCollection } from '@lib/db'
import OrdersTab from './OrdersTab'
import CatalogTab from './CatalogTab'
import { FlaskConical, ClipboardList, ListChecks } from 'lucide-react'

export default function LabPage() {
  const { facilityId } = useFacility()
  const { can } = usePermission()
  const [tab, setTab] = useState('orders')
  const [tests, setTests] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/lab/tests`, (data) => {
        setTests(data.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      }),
      subscribeToCollection(`facilities/${facilityId}/lab/orders`, (data) => {
        setOrders(data.sort((a, b) => (b.orderDate || b.createdAt || 0) - (a.orderDate || a.createdAt || 0)))
        setLoading(false)
      }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const pendingCount = orders.filter((o) => o.status !== 'report_ready').length
  const canWrite = can('lab', 'create') || can('lab', 'update')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><FlaskConical size={22} /> Lab / Diagnostics</h2>
          <p>{pendingCount} order{pendingCount !== 1 ? 's' : ''} pending report</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
          <ClipboardList size={15} /> Orders {pendingCount > 0 && <span className="badge badge-warning">{pendingCount}</span>}
        </button>
        <button className={`tab ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>
          <ListChecks size={15} /> Test Catalog
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading lab data...</div>
      ) : tab === 'orders' ? (
        <OrdersTab orders={orders} tests={tests} canWrite={canWrite} />
      ) : (
        <CatalogTab tests={tests} canWrite={canWrite} />
      )}
    </div>
  )
}
