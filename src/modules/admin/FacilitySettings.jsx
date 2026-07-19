import { useState, useEffect } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { setDocument } from '@lib/db'
import { useToast } from '@components/Toast'
import {
  FACILITY_TYPE_LABELS, MODULE_LABELS, INDIAN_STATES,
} from '@lib/constants'
import { Save, Building2, Settings, Shield } from 'lucide-react'

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
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
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
      </div>

      {tab === 'general' && (
        <div className="settings-section">
          <div className="form-group">
            <label>Facility Name</label>
            <input value={form.facilityName || ''} onChange={update('facilityName')} />
          </div>
          <div className="form-group">
            <label>Facility Type</label>
            <input value={FACILITY_TYPE_LABELS[form.facilityType] || ''} disabled />
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
