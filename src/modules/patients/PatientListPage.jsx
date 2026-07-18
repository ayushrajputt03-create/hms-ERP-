import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import { subscribeToCollection } from '@lib/db'
import { formatDate, calculateAge } from '@lib/utils'
import DataTable from '@components/DataTable'
import { Users, Plus, AlertTriangle } from 'lucide-react'

export default function PatientListPage() {
  const navigate = useNavigate()
  const { staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const { can } = usePermission()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!facilityId) return
    const unsub = subscribeToCollection(
      `facilities/${facilityId}/patients`,
      (data) => {
        setPatients(
          data
            .filter((p) => p.status !== 'archived')
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        )
        setLoading(false)
      }
    )
    return unsub
  }, [facilityId])

  const columns = [
    {
      header: 'UHID',
      accessor: 'uhid',
      width: '140px',
      cell: (row) => <span className="font-mono">{row.uhid || '—'}</span>,
    },
    { header: 'Name', accessor: 'name' },
    {
      header: 'Age / Gender',
      cell: (row) => {
        const age = row.dob ? calculateAge(row.dob) : ''
        const gender = row.gender ? row.gender.charAt(0).toUpperCase() : ''
        return age ? `${age}Y / ${gender}` : gender || '—'
      },
    },
    { header: 'Phone', accessor: 'phone' },
    {
      header: 'Allergies',
      cell: (row) => {
        if (!row.allergies?.length) return '—'
        return (
          <span className="badge badge-danger" title={row.allergies.join(', ')}>
            <AlertTriangle size={11} /> {row.allergies.length}
          </span>
        )
      },
    },
    {
      header: 'Last Visit',
      cell: (row) => row.lastVisitDate ? formatDate(row.lastVisitDate) : '—',
    },
    {
      header: 'Registered',
      cell: (row) => formatDate(row.createdAt),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><Users size={22} /> Patients</h2>
          <p>{patients.length} registered patient{patients.length !== 1 ? 's' : ''}</p>
        </div>
        {can('patients', 'create') && (
          <button className="btn btn-primary" onClick={() => navigate('/patients/new')}>
            <Plus size={16} /> New Patient
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading patients...</div>
      ) : (
        <DataTable
          columns={columns}
          data={patients}
          searchPlaceholder="Search by name, UHID, or phone..."
          onRowClick={(row) => navigate(`/patients/${row.id}`)}
          emptyMessage="No patients registered yet. Click '+ New Patient' to add one."
        />
      )}
    </div>
  )
}
