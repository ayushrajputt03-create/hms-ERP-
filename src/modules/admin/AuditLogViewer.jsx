import { useFacility } from '@hooks/useFacility'
import { useFirestoreCollection } from '@hooks/useFirestoreCollection'
import { orderBy } from '@lib/db'
import { formatDate } from '@lib/utils'
import { ROLE_LABELS } from '@lib/constants'
import DataTable from '@components/DataTable'
import { ScrollText } from 'lucide-react'

export default function AuditLogViewer() {
  const { facilityId } = useFacility()

  const { data: logs, loading } = useFirestoreCollection(
    facilityId ? `facilities/${facilityId}/auditLog` : null,
    [orderBy('timestamp', 'desc')]
  )

  const columns = [
    {
      header: 'Time',
      accessor: 'timestamp',
      cell: (r) => formatDate(r.timestamp?.toDate?.() || r.timestamp, 'datetime'),
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
      </div>

      <DataTable
        columns={columns}
        data={logs}
        searchPlaceholder="Search audit log..."
        emptyMessage="No audit entries yet."
      />
    </div>
  )
}
