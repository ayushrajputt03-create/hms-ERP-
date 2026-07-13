import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { usePermission } from '@hooks/usePermission'
import { getDocument, subscribeToCollection } from '@lib/db'
import { formatDate, calculateAge, getInitials } from '@lib/utils'
import PatientTimeline from './PatientTimeline'
import PatientQR from './PatientQR'
import {
  ChevronLeft, Edit, Phone, Mail, MapPin, AlertTriangle,
  Heart, User, Clock, FileText, Receipt, FlaskConical, BedDouble,
} from 'lucide-react'

const TABS = [
  { key: 'overview', label: 'Overview', icon: Clock },
  { key: 'visits', label: 'Visits', icon: FileText },
  { key: 'admissions', label: 'Admissions', icon: BedDouble },
  { key: 'lab', label: 'Lab Reports', icon: FlaskConical },
  { key: 'bills', label: 'Bills', icon: Receipt },
]

export default function PatientProfile() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const { facilityId } = useFacility()
  const { can } = usePermission()
  const [patient, setPatient] = useState(null)
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  const [visits, setVisits] = useState([])
  const [admissions, setAdmissions] = useState([])
  const [labOrders, setLabOrders] = useState([])
  const [invoices, setInvoices] = useState([])

  useEffect(() => {
    if (!facilityId || !patientId) return
    getDocument(`facilities/${facilityId}/patients/${patientId}`).then((doc) => {
      setPatient(doc)
      setLoading(false)
    })
  }, [facilityId, patientId])

  useEffect(() => {
    if (!facilityId || !patientId) return
    const unsubs = []

    unsubs.push(subscribeToCollection(`facilities/${facilityId}/opdVisits`, (data) => {
      setVisits(data.filter((v) => v.patientId === patientId).sort((a, b) => (b.visitDate || b.createdAt || 0) - (a.visitDate || a.createdAt || 0)))
    }))

    unsubs.push(subscribeToCollection(`facilities/${facilityId}/ipd`, (data) => {
      setAdmissions(data.filter((a) => a.patientId === patientId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    }))

    unsubs.push(subscribeToCollection(`facilities/${facilityId}/lab`, (data) => {
      setLabOrders(data.filter((l) => l.patientId === patientId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    }))

    unsubs.push(subscribeToCollection(`facilities/${facilityId}/billing`, (data) => {
      setInvoices(data.filter((b) => b.patientId === patientId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    }))

    return () => unsubs.forEach((fn) => fn())
  }, [facilityId, patientId])

  if (loading) return <div className="empty-state">Loading patient...</div>
  if (!patient) return <div className="empty-state">Patient not found.</div>

  const age = patient.dob ? calculateAge(patient.dob) : null

  return (
    <div className="patient-profile">
      <div className="page-header">
        <button className="btn btn-outline" onClick={() => navigate('/patients')}>
          <ChevronLeft size={16} /> Back to Patients
        </button>
        {can('patients', 'update') && (
          <button className="btn btn-outline" onClick={() => navigate(`/patients/${patientId}/edit`)}>
            <Edit size={14} /> Edit
          </button>
        )}
      </div>

      {patient.allergies?.length > 0 && (
        <div className="allergy-banner">
          <AlertTriangle size={16} />
          <strong>ALLERGIES:</strong>
          {patient.allergies.map((a, i) => (
            <span key={i} className="allergy-tag">{a}</span>
          ))}
        </div>
      )}

      <div className="profile-header-card">
        <div className="profile-avatar">
          {getInitials(patient.name)}
        </div>
        <div className="profile-info">
          <h2>{patient.name}</h2>
          <div className="profile-meta">
            <span className="font-mono uhid-display">{patient.uhid || 'No UHID'}</span>
            {age != null && <span>{age}Y / {patient.gender?.charAt(0).toUpperCase()}</span>}
            {patient.bloodGroup && <span className="badge badge-muted">{patient.bloodGroup}</span>}
          </div>
          <div className="profile-contact">
            {patient.phone && <span><Phone size={13} /> {patient.phone}</span>}
            {patient.email && <span><Mail size={13} /> {patient.email}</span>}
            {patient.city && <span><MapPin size={13} /> {patient.city}, {patient.state}</span>}
          </div>
        </div>
        <div className="profile-qr">
          <PatientQR uhid={patient.uhid} />
        </div>
      </div>

      {patient.conditions?.length > 0 && (
        <div className="conditions-bar">
          <Heart size={14} /> <strong>Conditions:</strong>
          {patient.conditions.map((c, i) => (
            <span key={i} className="condition-tag">{c}</span>
          ))}
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {tab === 'overview' && (
          <PatientTimeline
            visits={visits}
            admissions={admissions}
            labOrders={labOrders}
            invoices={invoices}
          />
        )}
        {tab === 'visits' && (
          <VisitsList visits={visits} navigate={navigate} />
        )}
        {tab === 'admissions' && (
          <RecordList items={admissions} type="admission" />
        )}
        {tab === 'lab' && (
          <RecordList items={labOrders} type="lab" />
        )}
        {tab === 'bills' && (
          <RecordList items={invoices} type="bill" />
        )}
      </div>
    </div>
  )
}

function VisitsList({ visits, navigate }) {
  if (visits.length === 0) return <div className="empty-state">No OPD visits recorded yet.</div>
  return (
    <div className="visits-list">
      {visits.map((v) => (
        <div key={v.id} className="visit-card" onClick={() => navigate(`/opd/consultation/${v.id}`)}>
          <div className="visit-card-header">
            <span className="font-mono">#{v.tokenNumber || '—'}</span>
            <span>{formatDate(v.visitDate || v.createdAt, 'datetime')}</span>
            <span className={`badge badge-${v.status === 'completed' ? 'success' : v.status === 'in_progress' ? 'warning' : 'muted'}`}>
              {v.status || 'pending'}
            </span>
          </div>
          {v.chiefComplaint && <p className="visit-complaint">{v.chiefComplaint}</p>}
          {v.diagnosis && <p className="visit-diagnosis"><strong>Dx:</strong> {v.diagnosis}</p>}
        </div>
      ))}
    </div>
  )
}

function RecordList({ items, type }) {
  if (items.length === 0) return <div className="empty-state">No {type} records found.</div>
  return (
    <div className="record-list">
      {items.map((item) => (
        <div key={item.id} className="record-item">
          <span>{formatDate(item.createdAt, 'datetime')}</span>
          <span>{item.status || item.type || '—'}</span>
          <span>{item.description || item.testName || item.invoiceNumber || item.id}</span>
        </div>
      ))}
    </div>
  )
}
