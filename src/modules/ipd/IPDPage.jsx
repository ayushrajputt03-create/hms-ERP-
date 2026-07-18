import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import { subscribeToCollection } from '@lib/db'
import { formatDate } from '@lib/utils'
import BedBoard from './BedBoard'
import WardsSetup from './WardsSetup'
import { BedDouble, LayoutGrid, ClipboardList, Settings, Plus } from 'lucide-react'

export default function IPDPage() {
  const navigate = useNavigate()
  const { staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const { can } = usePermission()
  const [tab, setTab] = useState('beds')
  const [wards, setWards] = useState([])
  const [admissions, setAdmissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/ipd/wards`, (data) => {
        setWards(data.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      }),
      subscribeToCollection(`facilities/${facilityId}/ipd/admissions`, (data) => {
        setAdmissions(data.sort((a, b) => (b.admissionDate || 0) - (a.admissionDate || 0)))
        setLoading(false)
      }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const activeAdmissions = admissions.filter((a) => a.status === 'admitted')
  const isAdmin = ['facility_admin', 'super_admin'].includes(staffProfile?.role)
  const canAdmit = can('ipd', 'create')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><BedDouble size={22} /> IPD / Admissions</h2>
          <p>{activeAdmissions.length} patient{activeAdmissions.length !== 1 ? 's' : ''} currently admitted</p>
        </div>
        {canAdmit && (
          <button className="btn btn-primary" onClick={() => navigate('/ipd/admit')}>
            <Plus size={16} /> New Admission
          </button>
        )}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'beds' ? 'active' : ''}`} onClick={() => setTab('beds')}>
          <LayoutGrid size={15} /> Bed Board
        </button>
        <button className={`tab ${tab === 'admissions' ? 'active' : ''}`} onClick={() => setTab('admissions')}>
          <ClipboardList size={15} /> Admissions
        </button>
        {isAdmin && (
          <button className={`tab ${tab === 'wards' ? 'active' : ''}`} onClick={() => setTab('wards')}>
            <Settings size={15} /> Wards Setup
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading IPD data...</div>
      ) : (
        <>
          {tab === 'beds' && (
            <BedBoard
              wards={wards}
              admissions={activeAdmissions}
              onBedClick={(admissionId) => navigate(`/ipd/admission/${admissionId}`)}
            />
          )}
          {tab === 'admissions' && (
            <AdmissionsList admissions={admissions} onOpen={(id) => navigate(`/ipd/admission/${id}`)} />
          )}
          {tab === 'wards' && isAdmin && <WardsSetup wards={wards} />}
        </>
      )}
    </div>
  )
}

function AdmissionsList({ admissions, onOpen }) {
  const [filter, setFilter] = useState('admitted')
  const filtered = filter === 'all' ? admissions : admissions.filter((a) => a.status === filter)

  return (
    <div>
      <div className="pharmacy-alerts">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="admitted">Currently Admitted</option>
          <option value="discharged">Discharged</option>
          <option value="all">All</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">No admissions found.</div>
      ) : (
        <div className="queue-list">
          {filtered.map((a) => (
            <div key={a.id} className="queue-card" style={{ cursor: 'pointer' }} onClick={() => onOpen(a.id)}>
              <div className="queue-patient-info">
                <div className="queue-patient-name">{a.patientName}</div>
                <div className="queue-patient-meta">
                  <span className="font-mono">{a.patientUhid}</span>
                  <span> — {a.wardName} / {a.bedName}</span>
                </div>
                <div className="queue-doctor-name">
                  Dr. {a.doctorName} — Admitted {formatDate(a.admissionDate, 'datetime')}
                  {a.status === 'discharged' && ` — Discharged ${formatDate(a.dischargedAt, 'datetime')}`}
                </div>
              </div>
              <span className={`badge ${a.status === 'admitted' ? 'badge-warning' : 'badge-success'}`}>
                {a.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
