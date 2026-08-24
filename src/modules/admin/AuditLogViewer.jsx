import { useState, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useFirestoreCollection } from '@hooks/useFirestoreCollection'
import { formatDate, toISODate } from '@lib/utils'
import { ROLE_LABELS } from '@lib/constants'
import DataTable from '@components/DataTable'
import { ScrollText, Download } from 'lucide-react'

const MODULE_OPTIONS = [
  '', 'billing', 'lab', 'opd', 'ipd', 'pharmacy', 'staff', 'patients', 'admin',
]

export default function AuditLogViewer() {
  const { facilityId } = useFacility()
  const [filterModule, setFilterModule] = useState('')
  const [filterDate, setFilterDate] = useState('')

  const { data: rawLogs, loading } = useFirestoreCollection(
    facilityId ? `facilities/${facilityId}/auditLog` : null
  )

  const logs = useMemo(() => {
    let sorted = [...rawLogs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    if (filterModule) sorted = sorted.filter((e) => e.module === filterModule)
    if (filterDate) sorted = sorted.filter((e) => e.timestamp && toISODate(new Date(Number(e.timestamp))) === filterDate)
    return sorted
  }, [rawLogs, filterModule, filterDate])

  const exportCSV = () => {
    const rows = [
      ['Time', 'Action', 'Module', 'Description', 'Entity', 'Performed By', 'Role'],
      ...logs.map((e) => [
        formatDate(e.timestamp, 'datetime'),
        e.action || '',
        e.module || '',
        e.description || '',
        e.entityId || '',
        e.performedBy?.name || 'Unknown',
        ROLE_LABELS[e.performedBy?.role] || e.performedBy?.role || '',
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `audit-log-${toISODate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const columns = [
    {
      header: 'Time',
      accessor: 'timestamp',
      cell: (r) => formatDate(r.timestamp, 'datetime'),
      width: '160px',
    },
    { header: 'Action', accessor: 'action' },
    { header: 'Module', accessor: 'module' },
    { header: 'Description', accessor: 'description' },
    {
      header: 'By',
      cell: (r) => `${r.performedBy?.name || 'Unknown'} (${ROLE_LABELS[r.performedBy?.role] || r.performedBy?.role || ''})`,
    },
  ]

  return (
    <div className="audit-page">
      <div className="page-header">
        <h2><ScrollText size={20} /> Audit Log</h2>
        <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={logs.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="form-row" style={{ marginBottom: '1rem', alignItems: 'flex-end', gap: '0.75rem' }}>
        <div className="form-group" style={{ minWidth: 160, margin: 0 }}>
          <label>Module</label>
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
            <option value="">All modules</option>
            {MODULE_OPTIONS.filter(Boolean).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 160, margin: 0 }}>
          <label>Date</label>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </div>
        {(filterModule || filterDate) && (
          <button className="btn btn-outline btn-sm" onClick={() => { setFilterModule(''); setFilterDate('') }}>
            Clear filters
          </button>
        )}
        <span className="text-muted" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      <DataTable
        columns={columns}
        data={logs}
        searchPlaceholder="Search audit log..."
        emptyMessage="No audit entries found."
      />
    </div>
  )
}
