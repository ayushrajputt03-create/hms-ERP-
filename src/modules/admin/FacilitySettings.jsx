import { useState, useEffect } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { setDocument } from '@lib/db'
import { useToast } from '@components/Toast'
import {
  FACILITY_TYPE_LABELS, FACILITY_TYPE_MODULES, MODULE_LABELS, INDIAN_STATES,
} from '@lib/constants'
import { Save, Building2, Settings, Shield, IndianRupee, Network } from 'lucide-react'
import TariffMaster from './TariffMaster'
import DepartmentsManager from './DepartmentsManager'

// Tabs that manage their own records and so have no page-level Save button.
const SELF_SAVING_TABS = ['tariffs', 'departments']

export default function FacilitySettings() {
  const { facilityId, facilityConfig } = useFacility()
  const { user, staffProfile } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('general')

  useEffect(() => {
    if (facilityConfig) {
      setForm({ ...facilityConfig })
    }
  }, [facilityConfig])

  if (!form) return null

  const update = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm({ ...form, [field]: val })
  }

  const toggleModule = (mod) => {
    setForm({
      ...form,
      modules: { ...form.modules, [mod]: !form.modules[mod] },
    })
  }

  // Facility type used to be a locked field: whatever was picked in the setup
  // wizard was permanent, and the only way to correct a wrong choice was to
  // register a whole new facility. A clinic that adds beds, or a nursing home
  // that opens a lab, is an ordinary thing — it should not cost a re-onboard.
  //
  // Changing the type deliberately does NOT touch the module switches. Type
  // only seeds defaults at setup; after that the modules are operational
  // state. Silently re-applying defaults could switch IPD off while patients
  // are admitted, taking the ward board away from the staff using it. The
  // defaults are offered as an explicit action below instead.
  const typeChanged = form.facilityType !== facilityConfig?.facilityType

  const defaultsFor = FACILITY_TYPE_MODULES[form.facilityType] || {}
  const moduleDelta = Object.keys(defaultsFor)
    .filter((m) => !!defaultsFor[m] !== !!form.modules?.[m])
    .map((m) => ({ module: m, turningOn: !!defaultsFor[m] }))

  const applyTypeDefaults = () => {
    setForm({ ...form, modules: { ...form.modules, ...defaultsFor, billing: true } })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDocument(`facilities/${facilityId}/config`, form, {
        user: { uid: user.uid, name: staffProfile.name, role: staffProfile.role },
        facilityId,
        audit: {
          action: 'update', module: 'admin', entityType: 'facilityConfig',
          description: 'Updated facility settings',
        },
      })
      toast.success('Settings saved.')
    } catch (err) {
      toast.error('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>Facility Settings</h2>
        {!SELF_SAVING_TABS.includes(tab) && (
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
          <Building2 size={16} /> General
        </button>
        <button className={`tab ${tab === 'modules' ? 'active' : ''}`} onClick={() => setTab('modules')}>
          <Settings size={16} /> Modules
        </button>
        <button className={`tab ${tab === 'billing' ? 'active' : ''}`} onClick={() => setTab('billing')}>
          <Shield size={16} /> Billing & GST
        </button>
        <button className={`tab ${tab === 'tariffs' ? 'active' : ''}`} onClick={() => setTab('tariffs')}>
          <IndianRupee size={16} /> Tariff Master
        </button>
        <button className={`tab ${tab === 'departments' ? 'active' : ''}`} onClick={() => setTab('departments')}>
          <Network size={16} /> Departments
        </button>
      </div>

      {tab === 'tariffs' && <TariffMaster />}
      {tab === 'departments' && <DepartmentsManager />}

      {tab === 'general' && (
        <div className="settings-section">
          <div className="form-group">
            <label>Facility Name</label>
            <input value={form.facilityName || ''} onChange={update('facilityName')} />
          </div>
          <div className="form-group">
            <label>Facility Type</label>
            <select value={form.facilityType || ''} onChange={update('facilityType')}>
              <option value="">Select type…</option>
              {Object.entries(FACILITY_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {typeChanged && (
              <p className="settings-hint">
                {moduleDelta.length === 0 ? (
                  <>Your modules already match this type. Save to apply the change.</>
                ) : (
                  <>
                    Your modules are left exactly as they are. If you want the
                    standard set for {FACILITY_TYPE_LABELS[form.facilityType]}, that
                    would turn{' '}
                    {moduleDelta.map((d, i) => (
                      <span key={d.module}>
                        {i > 0 && ', '}
                        <strong>{MODULE_LABELS[d.module] || d.module}</strong>{' '}
                        {d.turningOn ? 'on' : 'off'}
                      </span>
                    ))}
                    .{' '}
                    <button type="button" className="btn btn-outline btn-sm"
                      onClick={applyTypeDefaults}>
                      Apply defaults
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone || ''} onChange={update('phone')} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input value={form.email || ''} onChange={update('email')} />
            </div>
          </div>
          <div className="form-group">
            <label>Address</label>
            <textarea value={form.address || ''} onChange={update('address')} rows={2} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>City</label>
              <input value={form.city || ''} onChange={update('city')} />
            </div>
            <div className="form-group">
              <label>State</label>
              <select value={form.state || ''} onChange={update('state')}>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>PIN Code</label>
              <input value={form.pincode || ''} onChange={update('pincode')} maxLength={6} />
            </div>
          </div>
          {form.modules?.ipd && (
            <div className="form-group">
              <label>Bed Count</label>
              <input type="number" value={form.bedCount || 0} onChange={update('bedCount')} min={0} />
            </div>
          )}
        </div>
      )}

      {tab === 'modules' && (
        <div className="settings-section">
          <p className="settings-hint">Toggle modules on/off for your facility. Billing is always enabled.</p>
          <div className="module-toggles">
            {Object.entries(MODULE_LABELS).map(([key, label]) => {
              const alwaysOn = key === 'billing' || key === 'dashboard' || key === 'admin' || key === 'staff'
              return (
                <label key={key} className="module-toggle">
                  <input
                    type="checkbox"
                    checked={form.modules?.[key] ?? false}
                    onChange={() => toggleModule(key)}
                    disabled={alwaysOn}
                  />
                  <span>{label}</span>
                  {alwaysOn && <span className="badge badge-muted">Always on</span>}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div className="settings-section">
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.gstEnabled || false} onChange={update('gstEnabled')} />
              Enable GST on invoices
            </label>
          </div>
          {form.gstEnabled && (
            <div className="form-row">
              <div className="form-group">
                <label>GSTIN</label>
                <input value={form.gstin || ''} onChange={update('gstin')} placeholder="GST Number" />
              </div>
              <div className="form-group">
                <label>GST Rate (%)</label>
                <input type="number" min="0" max="28" value={form.gstRate ?? 18} onChange={update('gstRate')} />
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.tpaEnabled || false} onChange={update('tpaEnabled')} />
              Enable Insurance / TPA claims
            </label>
            <span className="settings-hint">Adds a "TPA Claims" tab in Billing to track insurance claims.</span>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>UHID Prefix</label>
              <input value={form.uhidPrefix || 'PT'} onChange={update('uhidPrefix')} maxLength={5} />
            </div>
            <div className="form-group">
              <label>Invoice Prefix</label>
              <input value={form.invoicePrefix || 'INV'} onChange={update('invoicePrefix')} maxLength={5} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
