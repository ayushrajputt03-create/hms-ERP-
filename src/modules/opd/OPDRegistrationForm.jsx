import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument, incrementCounter } from '@lib/db'
import { registerOpdVisit, registrationErrorMessage } from '@lib/opd'
import { buildOpdSlipPDF, printPDF } from "@lib/pdf"
import { departmentsForFlow, doctorsInDepartment, departmentLocation } from '@lib/departments'
import {
  RELATION_TYPES, PATIENT_TYPES, PATIENT_TYPE_LABELS,
  BILLING_TYPES, BILLING_TYPE_LABELS,
  formatAge, maskPhone, isValidPhone, normalisePhone, findPatientsByPhone,
} from '@lib/patients'
import { INDIAN_STATES } from '@lib/constants'
import {
  Search, UserPlus, User, Phone, Mail, MapPin, Calendar, Briefcase,
  Network, Stethoscope, Printer, CheckCircle, ChevronLeft, Loader, ShieldAlert, Hash,
} from 'lucide-react'
import TokenLookup from './TokenLookup'

const EMPTY_PATIENT = {
  name: '', dob: '', gender: 'male',
  relationType: RELATION_TYPES.SO, guardianName: '',
  phone: '', email: '', address: '', city: '', state: 'Uttar Pradesh', pincode: '',
  occupation: '', patientType: PATIENT_TYPES.NON_MLC, abhaId: '',
}

const nowLocalDateTime = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function OPDRegistrationForm() {
  const navigate = useNavigate()
  const { user, staffProfile } = useAuth()
  const { facilityId, facilityConfig } = useFacility()

  const [patients, setPatients] = useState([])
  const [departments, setDepartments] = useState([])
  const [doctors, setDoctors] = useState([])

  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState(false)
  // null while searching, '' once the desk chose "register as new".
  const [existingId, setExistingId] = useState(null)
  const [patient, setPatient] = useState(EMPTY_PATIENT)

  const [visit, setVisit] = useState({
    departmentId: '', doctorId: '', unit: '',
    billingType: BILLING_TYPES.GENERAL,
    visitAt: nowLocalDateTime(),
    chiefComplaint: '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  // 'new' = register a walk-in, 'token' = look up an already-issued token.
  const [mode, setMode] = useState('new')

  useEffect(() => {
    if (!facilityId) return
    const unsubs = [
      subscribeToCollection(`facilities/${facilityId}/patients`, (data) => {
        setPatients(data.filter((p) => p.status !== 'archived'))
      }),
      subscribeToCollection(`facilities/${facilityId}/departments`, setDepartments),
      subscribeToCollection(`facilities/${facilityId}/staff`, (data) => {
        setDoctors(data.filter((s) => s.role === 'doctor' && s.status === 'active'))
      }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [facilityId])

  const opdDepartments = useMemo(() => departmentsForFlow(departments, 'opd'), [departments])
  const selectedDept = useMemo(
    () => departments.find((d) => d.id === visit.departmentId) || null,
    [departments, visit.departmentId]
  )
  const deptDoctors = useMemo(
    () => doctorsInDepartment(doctors, visit.departmentId),
    [doctors, visit.departmentId]
  )

  // ageFromDob returns null for a future or unparseable date, which is the
  // same thing it returns for "no DOB entered" — so the emptiness of the Age
  // field cannot be used to tell the two apart. Checked explicitly here.
  const dobError = useMemo(() => {
    if (!patient.dob) return ''
    const birth = new Date(patient.dob)
    if (Number.isNaN(birth.getTime())) return 'Enter a valid date of birth.'
    if (birth > new Date()) return 'Date of birth cannot be in the future.'
    return ''
  }, [patient.dob])

  const matches = useMemo(() => findPatientsByPhone(patients, search), [patients, search])
  const isNewPatient = existingId === ''
  const showPatientFields = existingId !== null

  const setP = (field) => (e) => setPatient({ ...patient, [field]: e.target.value })
  const setV = (field) => (e) => setVisit({ ...visit, [field]: e.target.value })

  const handleSearch = () => {
    setError('')
    setSearched(true)
    const found = findPatientsByPhone(patients, search)
    if (found.length === 1) {
      selectExisting(found[0])
    } else if (found.length === 0) {
      startNew()
    }
    // Several matches (a shared family number) — the desk picks from the list.
  }

  const selectExisting = (p) => {
    setExistingId(p.id)
    setPatient({
      ...EMPTY_PATIENT,
      ...Object.fromEntries(
        Object.keys(EMPTY_PATIENT).map((k) => [k, p[k] ?? EMPTY_PATIENT[k]])
      ),
    })
  }

  const startNew = () => {
    setExistingId('')
    setPatient({ ...EMPTY_PATIENT, phone: normalisePhone(search) })
  }

  const resetAll = () => {
    setResult(null)
    setSearch('')
    setSearched(false)
    setExistingId(null)
    setPatient(EMPTY_PATIENT)
    setVisit({
      departmentId: '', doctorId: '', unit: '',
      billingType: BILLING_TYPES.GENERAL,
      visitAt: nowLocalDateTime(),
      chiefComplaint: '',
    })
  }

  const handleRegister = async () => {
    if (!patient.name.trim()) { setError('Patient name is required.'); return }
    if (dobError) { setError(dobError); return }
    if (!isValidPhone(patient.phone)) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }
    if (!visit.departmentId) { setError('Select a department.'); return }
    if (!visit.doctorId) { setError('Select a doctor.'); return }

    setSaving(true)
    setError('')
    try {
      const auditOpts = {
        user: staffProfile?.name || user?.email,
        facilityId,
        audit: {
          action: isNewPatient ? 'patient_registered' : 'patient_updated',
          module: 'patients',
        },
      }
      const patientData = {
        ...patient,
        name: patient.name.trim(),
        phone: normalisePhone(patient.phone),
        dob: patient.dob || null,
        guardianName: patient.guardianName.trim() || null,
        email: patient.email.trim() || null,
        occupation: patient.occupation.trim() || null,
        abhaId: patient.abhaId.trim() || null,
        facilityId,
      }

      let patientId = existingId
      if (isNewPatient) {
        const prefix = facilityConfig?.uhidPrefix || 'HMS'
        const year = new Date().getFullYear()
        const counter = await incrementCounter(`facilities/${facilityId}/counters/uhid`)
        patientData.uhid = `${prefix}-${year}-${String(counter).padStart(5, '0')}`
        patientId = await addDocument(`facilities/${facilityId}/patients`, patientData, auditOpts)
      } else {
        // A returning patient may have moved or changed guardian; merge rather
        // than create a second record against the same mobile number.
        await updateDocument(`facilities/${facilityId}/patients/${patientId}`, patientData, auditOpts)
      }

      const created = await registerOpdVisit({
        patientId,
        departmentId: visit.departmentId,
        doctorId: visit.doctorId,
        visitDate: new Date(visit.visitAt).getTime(),
        chiefComplaint: visit.chiefComplaint,
        billingType: visit.billingType,
        unit: visit.unit,
      })

      setResult({
        visit: created,
        patient: { ...patientData, id: patientId, uhid: patientData.uhid || patients.find((p) => p.id === patientId)?.uhid },
      })
    } catch (err) {
      console.error('OPD registration error:', err)
      setError(registrationErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = async () => {
    const pdf = await buildOpdSlipPDF({
      facility: facilityConfig || {},
      patient: result.patient,
      visit: result.visit,
    })
    printPDF(pdf)
  }

  if (result) {
    return (
      <div>
        <div className="page-header">
          <h2><CheckCircle size={22} /> Registration Complete</h2>
        </div>
        <div className="patient-form-card registration-success" style={{ maxWidth: 640 }}>
          <div className="registration-token">
            <span className="registration-token-label">Token No.</span>
            <span className="registration-token-value">{result.visit.tokenNumber}</span>
          </div>
          <div className="registration-summary">
            <div><span>UHID</span><strong className="font-mono">{result.patient?.uhid || '—'}</strong></div>
            <div><span>Patient</span><strong>{result.patient?.name}</strong></div>
            <div><span>Dept. Reg. No.</span><strong className="font-mono">{result.visit.deptRegNo}</strong></div>
            <div><span>Department</span><strong>{result.visit.departmentName}</strong></div>
            <div><span>Doctor</span><strong>Dr. {result.visit.doctorName}</strong></div>
            <div><span>Room</span><strong>{[result.visit.floor, result.visit.roomNumber].filter(Boolean).join(', ') || '—'}</strong></div>
            <div><span>Fee</span><strong>Rs. {result.visit.feeAmount ?? 0}</strong></div>
          </div>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={resetAll}>
              <UserPlus size={14} /> Register Another
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/opd/queue')}>View Queue</button>
            <button className="btn btn-primary" onClick={handlePrint}>
              <Printer size={14} /> Print OPD Slip
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2>
          <button className="btn btn-icon" onClick={() => navigate('/opd')}><ChevronLeft size={20} /></button>
          <UserPlus size={22} /> OPD Registration
        </h2>
        <p>
          {mode === 'token'
            ? 'Look up a patient who already holds a token — including QR self-bookings.'
            : 'Search by mobile number first — returning patients keep their existing UHID.'}
        </p>
      </div>

      <div className="tabs">
        <button
          className={`tab ${mode === 'new' ? 'active' : ''}`}
          onClick={() => setMode('new')}
        >
          <UserPlus size={15} /> New Registration
        </button>
        <button
          className={`tab ${mode === 'token' ? 'active' : ''}`}
          onClick={() => setMode('token')}
        >
          <Hash size={15} /> Find by Token
        </button>
      </div>

      {mode === 'token' && <TokenLookup />}

      <div className="patient-form-card" style={{ maxWidth: 820, display: mode === 'new' ? undefined : 'none' }}>
        {error && <div className="auth-error">{error}</div>}

        <fieldset className="form-fieldset">
          <legend><Search size={14} /> Find Patient</legend>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label><Phone size={14} /> Mobile Number</label>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSearched(false); setExistingId(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="10-digit mobile number"
                inputMode="numeric"
              />
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSearch} disabled={!search.trim()}>
                <Search size={14} /> Search
              </button>
            </div>
          </div>

          {searched && matches.length > 1 && (
            <div className="patient-match-list">
              <p className="settings-hint">{matches.length} patients share this number — pick one:</p>
              {matches.map((p) => (
                <button
                  key={p.id}
                  className={`patient-match ${existingId === p.id ? 'active' : ''}`}
                  onClick={() => selectExisting(p)}
                >
                  <strong>{p.name}</strong>
                  <span className="font-mono">{p.uhid}</span>
                  <span>{formatAge(p.dob) || '—'} / {p.gender}</span>
                </button>
              ))}
              <button className="btn btn-outline btn-sm" onClick={startNew}>
                <UserPlus size={14} /> None of these — register new
              </button>
            </div>
          )}

          {searched && existingId && existingId !== '' && (
            <p className="settings-hint">
              Existing patient loaded — UHID{' '}
              <strong className="font-mono">{patients.find((p) => p.id === existingId)?.uhid}</strong>.
              Edits below update the same record.
            </p>
          )}
          {isNewPatient && (
            <p className="settings-hint">No patient found for that number. A new UHID will be issued on save.</p>
          )}
        </fieldset>

        {showPatientFields && (
          <>
            <fieldset className="form-fieldset">
              <legend><User size={14} /> Patient Details</legend>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Full Name *</label>
                  <input value={patient.name} onChange={setP('name')} placeholder="Patient full name" />
                </div>
                <div className="form-group">
                  <label>Sex *</label>
                  <select value={patient.gender} onChange={setP('gender')}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Relation</label>
                  <select value={patient.relationType} onChange={setP('relationType')}>
                    {Object.values(RELATION_TYPES).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Guardian / Spouse Name</label>
                  <input value={patient.guardianName} onChange={setP('guardianName')} placeholder="Father / husband name" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label><Calendar size={14} /> Date of Birth</label>
                  <input
                    type="date"
                    value={patient.dob}
                    onChange={setP('dob')}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="form-group">
                  {/* Computed, never typed — staff misreport age far more often
                      than they misreport a date of birth. */}
                  <label>Age (Y M D)</label>
                  <input value={formatAge(patient.dob) || '—'} readOnly disabled />
                  {/* The date input's `max` stops the picker offering a future
                      date, but a typed or pasted one still lands. Age would
                      then silently fall back to "—", which looks like a blank
                      field rather than bad input. */}
                  {dobError && <p className="field-hint field-hint-error">{dobError}</p>}
                </div>
                <div className="form-group">
                  <label><Phone size={14} /> Mobile *</label>
                  <input value={patient.phone} onChange={setP('phone')} placeholder="10-digit mobile" inputMode="numeric" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label><Mail size={14} /> Email</label>
                  <input type="email" value={patient.email} onChange={setP('email')} placeholder="Optional" />
                </div>
                <div className="form-group">
                  <label><Briefcase size={14} /> Occupation</label>
                  <input value={patient.occupation} onChange={setP('occupation')} placeholder="Optional" />
                </div>
                <div className="form-group">
                  <label>ABHA ID</label>
                  <input value={patient.abhaId} onChange={setP('abhaId')} placeholder="ABDM health ID" />
                </div>
              </div>

              <div className="form-group">
                <label><MapPin size={14} /> Address</label>
                <textarea value={patient.address} onChange={setP('address')} rows={2} placeholder="Full address" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>City</label>
                  <input value={patient.city} onChange={setP('city')} placeholder="City" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <select value={patient.state} onChange={setP('state')}>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>PIN</label>
                  <input value={patient.pincode} onChange={setP('pincode')} maxLength={6} placeholder="201102" />
                </div>
              </div>

              <div className="form-group">
                <label><ShieldAlert size={14} /> Case Type</label>
                <select value={patient.patientType} onChange={setP('patientType')}>
                  {Object.entries(PATIENT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </fieldset>

            <fieldset className="form-fieldset">
              <legend><Stethoscope size={14} /> Visit Details</legend>
              <div className="form-row">
                <div className="form-group">
                  <label><Network size={14} /> Department *</label>
                  <select
                    value={visit.departmentId}
                    onChange={(e) => setVisit({ ...visit, departmentId: e.target.value, doctorId: '' })}
                  >
                    <option value="">
                      {opdDepartments.length ? 'Select department...' : 'No OPD departments configured'}
                    </option>
                    {opdDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Doctor *</label>
                  <select value={visit.doctorId} onChange={setV('doctorId')} disabled={!visit.departmentId}>
                    <option value="">
                      {!visit.departmentId
                        ? 'Select a department first'
                        : deptDoctors.length ? 'Select doctor...' : 'No doctors in this department'}
                    </option>
                    {deptDoctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              {selectedDept && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Floor</label>
                    <input value={departmentLocation(selectedDept) || '—'} readOnly disabled />
                  </div>
                  <div className="form-group">
                    <label>Consulting Room No.</label>
                    <input value={selectedDept.roomNumber || '—'} readOnly disabled />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input value={visit.unit} onChange={setV('unit')} placeholder="e.g. Skin" />
                  </div>
                </div>
              )}

              {opdDepartments.length === 0 && (
                <p className="settings-hint">
                  Add departments under Administration → Facility Settings → Departments before registering.
                </p>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Date &amp; Time of Registration</label>
                  <input type="datetime-local" value={visit.visitAt} onChange={setV('visitAt')} />
                </div>
                <div className="form-group">
                  <label>Billing Type</label>
                  <select value={visit.billingType} onChange={setV('billingType')}>
                    {Object.entries(BILLING_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Chief Complaint</label>
                <input value={visit.chiefComplaint} onChange={setV('chiefComplaint')} placeholder="Brief reason for visit" />
              </div>

              <p className="settings-hint">
                Token number, department register number and the consultation fee are issued by the
                server on save. Contact number prints masked as {maskPhone(patient.phone) || '*******000'}.
              </p>
            </fieldset>

            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => navigate('/opd')}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRegister} disabled={saving}>
                {saving
                  ? <><Loader size={14} className="loading-icon" /> Registering...</>
                  : <><CheckCircle size={14} /> Register &amp; Issue Token</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
