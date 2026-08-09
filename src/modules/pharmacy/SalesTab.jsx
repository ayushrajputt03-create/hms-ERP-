import { useState, useEffect, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, getDocument } from '@lib/db'
import { buildPharmacyInvoicePDF } from '@lib/pdf'
import { formatINR, formatDate } from '@lib/utils'
import DataTable from '@components/DataTable'
import { useToast } from '@components/Toast'
import { Download, Printer } from 'lucide-react'

// Read-only sales ledger. Billing staff use this for reconciliation; the actual
// billed flag is flipped by the invoice RPC, never edited here.
export default function SalesTab() {
  const { facilityId, facilityConfig } = useFacility()
  const toast = useToast()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [printingId, setPrintingId] = useState(null)

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    return subscribeToCollection(`facilities/${facilityId}/pharmacy/sales`, (d) => {
      setSales(d.sort((a, b) => (b.saleDate || 0) - (a.saleDate || 0)))
      setLoading(false)
    })
  }, [facilityId])

  const totalValue = useMemo(() => sales.reduce((s, x) => s + (Number(x.total) || 0), 0), [sales])

  const exportCSV = () => {
    const rows = [
      ['Date', 'Type', 'Patient', 'UHID', 'Items', 'Total', 'Billed'],
      ...sales.map((s) => [
        formatDate(s.saleDate, 'datetime'), s.type,
        s.patientName || 'Walk-in', s.patientUhid || '',
        (s.items || []).map((i) => `${i.name} x${i.quantity}`).join('; '),
        s.total ?? 0, s.billed ? 'Yes' : 'No',
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `pharmacy-sales-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  // HSN, expiry and batch aren't copied onto the sale line at dispense time,
  // so the medicine and batch records are pulled at print time to build a
  // GST-compliant bill rather than printing blanks in those columns.
  const printBill = async (sale) => {
    setPrintingId(sale.id)
    try {
      const ids = (sale.items || [])
      const [medicines, batches, patient] = await Promise.all([
        Promise.all([...new Set(ids.map((i) => i.medicineId).filter(Boolean))]
          .map((id) => getDocument(`facilities/${facilityId}/pharmacy/medicines/${id}`))),
        Promise.all([...new Set(ids.map((i) => i.batchId).filter(Boolean))]
          .map((id) => getDocument(`facilities/${facilityId}/pharmacy/batches/${id}`))),
        sale.patientId ? getDocument(`facilities/${facilityId}/patients/${sale.patientId}`) : null,
      ])
      const byId = (list) => Object.fromEntries(list.filter(Boolean).map((d) => [d.id, d]))
      const pdf = await buildPharmacyInvoicePDF({
        facility: facilityConfig || {},
        patient,
        sale,
        medicineById: byId(medicines),
        batchById: byId(batches),
      })
      pdf.save(`Pharmacy-Bill-${sale.patientUhid || sale.id}.pdf`)
    } catch (err) {
      console.error('Pharmacy bill PDF error:', err)
      toast.error('Failed to generate the pharmacy bill.')
    } finally {
      setPrintingId(null)
    }
  }

  const columns = [
    { header: 'Date', cell: (s) => formatDate(s.saleDate, 'datetime') },
    { header: 'Type', cell: (s) => <span className="badge badge-muted">{s.type === 'walk_in' ? 'Walk-in' : 'Prescription'}</span> },
    { header: 'Patient', cell: (s) => s.patientName || '—' },
    { header: 'Items', cell: (s) => (s.items || []).map((i) => `${i.name} ×${i.quantity}`).join(', ') },
    { header: 'Total', cell: (s) => formatINR(s.total) },
    { header: 'Billed', cell: (s) => <span className={`badge ${s.billed ? 'badge-success' : 'badge-warning'}`}>{s.billed ? 'Billed' : 'Unbilled'}</span> },
    {
      header: 'Bill',
      cell: (s) => (
        <button
          className="btn btn-outline btn-sm"
          disabled={printingId === s.id}
          onClick={(e) => { e.stopPropagation(); printBill(s) }}
        >
          <Printer size={13} /> {printingId === s.id ? '…' : 'Print'}
        </button>
      ),
    },
  ]

  if (loading) return <div className="empty-state">Loading sales…</div>

  return (
    <div>
      <div className="pharmacy-alerts">
        <strong>Total sales value: {formatINR(totalValue)}</strong>
        <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={exportCSV}>
          <Download size={14} /> Export CSV
        </button>
      </div>
      <DataTable columns={columns} data={sales} searchPlaceholder="Search sales…" emptyMessage="No sales yet." />
    </div>
  )
}
