import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { getDocument, setDocument, addDocument, incrementCounter } from '@lib/db'
import { INDIAN_STATES } from '@lib/constants'
import {
  RELATION_TYPES, PATIENT_TYPES, PATIENT_TYPE_LABELS, formatAge,
} from '@lib/patients'
import TagInput from './TagInput'
import {
  User, Phone, Mail, MapPin, Calendar, Heart, AlertTriangle,
  ChevronLeft, Save, Loader, Briefcase, ShieldAlert,
} from 'lucide-react'

export default function PatientForm() {
  const navigate = useNavigate()
  const { patientId } = useParams()
  const isEdit = !!patientId
  const { user, staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '', dob: '', gender: 'male', phone: '', email: '',
    relationType: RELATION_TYPES.SO, guardianName: '', occupation: '',
    patientType: PATIENT_TYPES.NON_MLC, abhaId: '',
    address: '', city: '', state: 'Uttar Pradesh', pincode: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
    allergies: [], conditions: [], bloodGroup: '', notes: '',
  })

  useEffect(() => {
    if (!isEdit || !facilityId) return
    getDocument(`facilities/${facilityId}/patients/${patientId}`).then((doc) => {
      if (doc) {
        setForm({
          name: doc.name || '',
          dob: doc.dob || '',
          gender: doc.gender || 'male',
          phone: doc.phone || '',
          email: doc.email || '',
          relationType: doc.relationType || RELATION_TYPES.SO,
          guardianName: doc.guardianName || '',
          occupation: doc.occupation || '',
          patientType: doc.patientType || PATIENT_TYPES.NON_MLC,
          abhaId: doc.abhaId || '',
          address: doc.address || '',
          city: doc.city || '',
          state: doc.state || 'Uttar Pradesh',
          pincode: doc.pincode || '',
          emergencyContactName: doc.emergencyContact?.name || '',
          emergencyContactPhone: doc.emergencyContact?.phone || '',
          emergencyContactRelation: doc.emergencyContact?.relation || '',
          allergies: doc.allergies || [],
          conditions: doc.conditions || [],
          bloodGroup: doc.bloodGroup || '',
          notes: doc.notes || '',
        })
      }
      setLoading(false)
    })
  }, [isEdit, facilityId, patientId])

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Patient name is required.'); return }
    if (!form.phone.trim()) { setError('Phone number is required.'); return }
    if (!/^[6-9]\d{9}$/.test(form.phone.trim().replace(/[\s-]/g, ''))) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const patientData = {
        name: form.name.trim(),
        dob: form.dob || null,
        gender: form.gender,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        relationType: form.relationType,
        guardianName: form.guardianName.trim() || null,
        occupation: form.occupation.trim() || null,
        patientType: form.patientType,
        abhaId: form.abhaId.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state,
        pincode: form.pincode.trim() || null,
        emergencyContact: form.emergencyContactName ? {
          name: form.emergencyContactName.trim(),
          phone: form.emergencyContactPhone.trim(),
          relation: form.emergencyContactRelation.trim(),
        } : null,
        allergies: form.allergies,
        conditions: form.conditions,
        bloodGroup: form.bloodGroup || null,
        notes: form.notes.trim() || null,
        facilityId,
      }

      const auditOpts = {
        user: staffProfile?.name || user?.email,
        facilityId,
        audit: { action: isEdit ? 'patient_updated' : 'patient_registered', module: 'patients' },
      }

      if (isEdit) {
        await setDocument(`facilities/${facilityId}/patients/${patientId}`, patientData, auditOpts)
        navigate(`/patients/${patientId}`)
      } else {
        const prefix = facilityConfig?.uhidPrefix || 'HMS'
        const year = new Date().getFullYear()
        const counter = await incrementCounter(`facilities/${facilityId}/counters/uhid`)
        patientData.uhid = `${prefix}-${year}-${String(counter).padStart(5, '0')}`

        const newId = await addDocument(`facilities/${facilityId}/patients`, patientData, auditOpts)
        navigate(`/patients/${newId}`)
      }
    } catch (err) {
      console.error('Patient save error:', err)
      setError('Failed to save patient. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty-state">Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            <button className="btn btn-icon" onClick={() => navigate(-1)}><ChevronLeft size={20} /></button>
            {isEdit ? 'Edit Patient' : 'Register New Patient'}
          </h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="patient-form-card">
        {error && <div className="auth-error">{error}</div>}

        <fieldset className="form-fieldset">
          <legend>Demographics</legend>
          <div className="form-row">
            <div className="form-group">
              <label><User size={14} /> Full Name *</label>
              <input value={form.name} onChange={update('name')} placeholder="Patient full name" required />
            </div>
            <div className="form-group">
              <label><Calendar size={14} /> Date of Birth</label>
              <input type="date" value={form.dob} onChange={update('dob')} max={new Date().toISOString().split('T')[0]} />
            </div>
            <div className="form-group">
              {/* Derived, never typed — staff misreport age far more often
                  than they misreport a date of birth. */}
              <label>Age (Y M D)</label>
              <input value={formatAge(form.dob) || '—'} readOnly disabled />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Relation</label>
              <select value={form.relationType} onChange={update('relationType')}>
                {Object.values(RELATION_TYPES).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Guardian / Spouse Name</label>
              <input value={form.guardianName} onChange={update('guardianName')} placeholder="Father / husband name" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Gender *</label>
              <select value={form.gender} onChange={update('gender')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Blood Group</label>
              <select value={form.bloodGroup} onChange={update('bloodGroup')}>
                <option value="">Select</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><Phone size={14} /> Phone *</label>
              <input value={form.phone} onChange={update('phone')} placeholder="Phone number" required />
            </div>
            <div className="form-group">
              <label><Mail size={14} /> Email</label>
              <input type="email" value={form.email} onChange={update('email')} placeholder="Email (optional)" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><Briefcase size={14} /> Occupation</label>
              <input value={form.occupation} onChange={update('occupation')} placeholder="Optional" />
            </div>
            <div className="form-group">
              <label>ABHA ID</label>
              <input value={form.abhaId} onChange={update('abhaId')} placeholder="ABDM health ID" />
            </div>
            <div className="form-group">
              <label><ShieldAlert size={14} /> Case Type</label>
              <select value={form.patientType} onChange={update('patientType')}>
                {Object.entries(PATIENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="form-fieldset">
          <legend>Address</legend>
          <div className="form-group">
            <label><MapPin size={14} /> Address</label>
            <textarea value={form.address} onChange={update('address')} placeholder="Full address" rows={2} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>City</label>
              <input value={form.city} onChange={update('city')} placeholder="City" />
            </div>
            <div className="form-group">
              <label>State</label>
              <select value={form.state} onChange={update('state')}>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>PIN</label>
              <input value={form.pincode} onChange={update('pincode')} placeholder="201102" maxLength={6} />
            </div>
          </div>
        </fieldset>

        <fieldset className="form-fieldset">
          <legend>Emergency Contact</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input value={form.emergencyContactName} onChange={update('emergencyContactName')} placeholder="Contact name" />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.emergencyContactPhone} onChange={update('emergencyContactPhone')} placeholder="Contact phone" />
            </div>
            <div className="form-group">
              <label>Relation</label>
              <input value={form.emergencyContactRelation} onChange={update('emergencyContactRelation')} placeholder="e.g. Spouse, Parent" />
            </div>
          </div>
        </fieldset>

        <fieldset className="form-fieldset">
          <legend><AlertTriangle size={14} /> Medical Info</legend>
          <div className="form-group">
            <label className="label-danger">Allergies</label>
            <TagInput
              tags={form.allergies}
              onChange={(tags) => setForm({ ...form, allergies: tags })}
              placeholder="Type allergy and press Enter"
              variant="danger"
            />
          </div>
          <div className="form-group">
            <label><Heart size={14} /> Known Conditions</label>
            <TagInput
              tags={form.conditions}
              onChange={(tags) => setForm({ ...form, conditions: tags })}
              placeholder="Type condition and press Enter"
            />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={update('notes')} placeholder="Additional notes" rows={2} />
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <><Loader size={14} className="loading-icon" /> Saving...</> : <><Save size={14} /> {isEdit ? 'Update Patient' : 'Register Patient'}</>}
          </button>
        </div>
      </form>
    </div>
  )
}
