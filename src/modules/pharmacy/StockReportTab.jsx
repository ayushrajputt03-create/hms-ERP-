import { useState, useEffect, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection } from '@lib/db'
import { formatINR, toISODate } from '@lib/utils'
import StatCard from '@components/StatCard'
import { Package, PackageOpen, ShoppingCart, IndianRupee } from 'lucide-react'

export default function StockReportTab({ medicines }) {
  const { facilityId } = useFacility()
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return toISODate(d)
  })
  const [to, setTo] = useState(toISODate(new Date()))

  useEffect(() => {
    if (!facilityId) return
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/pharmacy/sales`, setSales),
      subscribeToCollection(`facilities/${facilityId}/pharmacy/purchases`, setPurchases),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const { filteredSales, filteredPurchases } = useMemo(() => {
    const fromTs = new Date(from + 'T00:00:00').getTime()
    const toTs = new Date(to + 'T23:59:59').getTime()
    return {
      filteredSales: sales.filter((s) => (s.saleDate || 0) >= fromTs && (s.saleDate || 0) <= toTs),
      filteredPurchases: purchases.filter((p) => (p.purchaseDate || 0) >= fromTs && (p.purchaseDate || 0) <= toTs),
    }
  }, [sales, purchases, from, to])

  const totalDispensed = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0)
  const totalPurchased = filteredPurchases.reduce((sum, p) => sum + (p.totalCost || 0), 0)
  const unitsDispensed = filteredSales.reduce(
    (sum, s) => sum + (s.items || []).reduce((n, it) => n + (it.qty || 0), 0), 0
  )
  const currentStockValue = medicines.reduce((sum, m) => sum + (m.quantity || 0) * (m.unitPrice || 0), 0)

  const topMedicines = useMemo(() => {
    const counts = {}
    filteredSales.forEach((s) => {
      (s.items || []).forEach((it) => {
        counts[it.name] = (counts[it.name] || 0) + (it.qty || 0)
      })
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [filteredSales])

  return (
    <div>
      <div className="report-filters">
        <div className="form-group">
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={PackageOpen} label="Dispensed (value)" value={formatINR(totalDispensed)} sub={`${unitsDispensed} units, ${filteredSales.length} sales`} color="teal" />
        <StatCard icon={ShoppingCart} label="Purchased (cost)" value={formatINR(totalPurchased)} sub={`${filteredPurchases.length} entries`} color="blue" />
        <StatCard icon={Package} label="Current Stock Value" value={formatINR(currentStockValue)} sub={`${medicines.length} medicines`} color="green" />
        <StatCard icon={IndianRupee} label="Gross Margin (period)" value={formatINR(totalDispensed - totalPurchased)} color="amber" />
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: '0.75rem' }}>Top Dispensed Medicines</h3>
        {topMedicines.length === 0 ? (
          <p className="text-muted">No sales in the selected period.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Medicine</th><th>Units Dispensed</th></tr>
            </thead>
            <tbody>
              {topMedicines.map(([name, qty]) => (
                <tr key={name}><td>{name}</td><td>{qty}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
