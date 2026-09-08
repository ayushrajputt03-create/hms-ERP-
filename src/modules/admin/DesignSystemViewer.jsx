import { useState } from 'react'
import {
  Palette, ShieldAlert, Heart, Activity, Pill, Film,
  UserCheck, AlertTriangle, CheckCircle, Clock, ChevronRight,
  Layers, Search, FileText, Filter, Eye, ZoomIn, Contrast, Sparkles
} from 'lucide-react'

export default function DesignSystemViewer() {
  const [activeTab, setActiveTab] = useState('tokens')
  const [activeStep, setActiveStep] = useState(1)
  const [dicomZoom, setDicomZoom] = useState(100)
  const [dicomContrast, setDicomContrast] = useState(50)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-primary-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary-400 font-semibold text-xs uppercase tracking-widest mb-1">
            <Sparkles size={14} /> Multi-Specialty Design System & UI Kit
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Hospital ERP Component Showcase</h1>
          <p className="text-slate-400 text-sm mt-1">
            Standardized clinical design tokens, status badges, emergency banners, and responsive component specs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-primary-500/20 text-primary-300 border border-primary-500/30 rounded-full text-xs font-mono">
            v2.5 Clinical Kit
          </span>
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-mono">
            WCAG AA Compliant
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-sm font-medium overflow-x-auto pb-1">
        {[
          { id: 'tokens', label: 'Color Tokens & Typography', icon: Palette },
          { id: 'badges', label: 'Clinical Badges & Statuses', icon: Layers },
          { id: 'alerts', label: 'Emergency & Allergy Alerts', icon: ShieldAlert },
          { id: 'cards', label: 'Patient & Clinical Cards', icon: Heart },
          { id: 'stepper', label: 'Form Steppers & Workflows', icon: Clock },
          { id: 'dicom', label: 'Radiology & DICOM Mock', icon: Film },
        ].map((tab) => {
          const Icon = tab.icon
          const isSelected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-2.5 px-4 rounded-t-lg transition border-b-2 font-medium whitespace-nowrap ${
                isSelected
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 bg-primary-50/50 dark:bg-primary-950/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab 1: Tokens */}
      {activeTab === 'tokens' && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Palette className="text-primary-600" size={20} /> Clinical Color Tokens
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <ColorSwatch
              name="Deep Navy (Primary)"
              hex="#052659"
              usage="Brand Header, Core Nav, High-Priority Buttons"
              bg="bg-[#052659]"
              text="text-white"
            />
            <ColorSwatch
              name="Health Blue (Accent)"
              hex="#0284C7"
              usage="Primary Actions, Active Tabs, Patient Status"
              bg="bg-[#0284C7]"
              text="text-white"
            />
            <ColorSwatch
              name="Clinical Green (Success)"
              hex="#059669"
              usage="Paid Invoices, Stable Vitals, Completed Tests"
              bg="bg-[#059669]"
              text="text-white"
            />
            <ColorSwatch
              name="Warning Amber"
              hex="#D97706"
              usage="Pending Fulfillment, Low Stock, Near Expiry"
              bg="bg-[#D97706]"
              text="text-white"
            />
            <ColorSwatch
              name="Emergency Red (Critical)"
              hex="#DC2626"
              usage="STRICTLY RESERVED: Severe Drug Allergies, ICU Vitals Breach, STAT Requests"
              bg="bg-[#DC2626]"
              text="text-white"
            />
          </div>
        </div>
      )}

      {/* Tab 2: Badges */}
      {activeTab === 'badges' && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="text-primary-600" size={20} /> Standardized Status Badges
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
              <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Lab & Diagnostics Priority Badges</h3>
              <div className="flex flex-wrap gap-3">
                <span className="badge badge-error uppercase font-bold text-xs px-3 py-1 animate-pulse">STAT / Emergency</span>
                <span className="badge badge-warning uppercase font-bold text-xs px-3 py-1">Urgent</span>
                <span className="badge badge-info uppercase font-medium text-xs px-3 py-1">Routine</span>
                <span className="badge badge-success uppercase font-medium text-xs px-3 py-1">Report Verified</span>
              </div>
            </div>

            <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
              <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">IPD & Bed Grid Badges</h3>
              <div className="flex flex-wrap gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200">
                  Occupied
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200">
                  Vacant / Ready
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200">
                  Sanitizing / Cleaning
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200">
                  Reserved for Admission
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Allergy Alerts */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="text-rose-600" size={20} /> Severe Red Allergy & Critical Banners
          </h2>

          <div className="p-4 bg-rose-600 text-white rounded-xl shadow-lg border-2 border-rose-700 space-y-2">
            <div className="flex items-center gap-3">
              <AlertTriangle className="animate-bounce shrink-0" size={24} />
              <div>
                <h3 className="font-bold uppercase tracking-wider text-sm">CRITICAL DRUG ALLERGY WARNING</h3>
                <p className="text-xs text-rose-100 mt-0.5">
                  Patient has documented severe anaphylaxis response to: <strong>PENICILLIN, SULFA DRUGS, NSAIDS</strong>.
                  Do not prescribe or dispense without CMO override.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-500/15 border-l-4 border-amber-500 rounded-r-xl text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <Clock className="shrink-0 text-amber-600 mt-0.5" size={20} />
            <div>
              <h4 className="font-bold text-sm">Cross-Department Transfer Pending Confirmation</h4>
              <p className="text-xs mt-0.5">
                Patient transferred from Orthopedics Ward 3B to ICU Bed 04. Vitals handover pending nurse sign-off.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Patient & Clinical Cards */}
      {activeTab === 'cards' && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Heart className="text-primary-600" size={20} /> 360° Patient Profile & Timeline Card
          </h2>

          <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-lg">
                  RK
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">Rajesh Kumar</h3>
                    <span className="badge badge-info text-xs">UHID: P-2026-0894</span>
                  </div>
                  <p className="text-xs text-slate-500">45 Yrs / Male • Blood Group: O+ • OPD Token #14</p>
                </div>
              </div>
              <span className="badge badge-error uppercase text-xs px-3 py-1 font-bold">
                Penicillin Allergy
              </span>
            </div>

            {/* Department Visit Timeline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Multi-Department Visit Flow</h4>
              <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto pb-2">
                <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg flex items-center gap-1.5 shrink-0">
                  <UserCheck size={14} /> Triage Desk
                </span>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
                <span className="px-3 py-1.5 bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 rounded-lg flex items-center gap-1.5 shrink-0 border border-blue-200">
                  <Activity size={14} /> Orthopedics (OPD)
                </span>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
                <span className="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded-lg flex items-center gap-1.5 shrink-0 border border-amber-200">
                  <Film size={14} /> Radiology (X-Ray)
                </span>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
                <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-lg flex items-center gap-1.5 shrink-0 border border-emerald-200">
                  <Pill size={14} /> Pharmacy Fulfillment
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Stepper */}
      {activeTab === 'stepper' && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="text-primary-600" size={20} /> Guided Clinical Workflow Stepper
          </h2>

          <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-6">
            <div className="flex justify-between items-center relative">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-800 -z-0"></div>
              {[
                { step: 1, label: '1. Patient Triage' },
                { step: 2, label: '2. Clinical Examination' },
                { step: 3, label: '3. Orders & Prescriptions' },
                { step: 4, label: '4. Billing & Discharge' },
              ].map((s) => (
                <button
                  key={s.step}
                  onClick={() => setActiveStep(s.step)}
                  className={`relative z-10 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition ${
                    activeStep === s.step
                      ? 'bg-primary-600 text-white shadow-lg ring-4 ring-primary-100 dark:ring-primary-900/50'
                      : activeStep > s.step
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {activeStep > s.step ? <CheckCircle size={14} /> : null}
                  {s.label}
                </button>
              ))}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-sm border border-slate-200 dark:border-slate-700">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Active Step Content: {activeStep === 1 && 'Record initial vital signs, chief complaint, and initial triage grade.'}
                {activeStep === 2 && 'ICD-10 Diagnosis entry, physical findings, and systemic review.'}
                {activeStep === 3 && 'Order lab diagnostics, radiology imaging, and medications.'}
                {activeStep === 4 && 'Consolidated invoice generation and follow-up appointment scheduling.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: DICOM Mock */}
      {activeTab === 'dicom' && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Film className="text-primary-600" size={20} /> DICOM & Radiology Imaging Viewer Mock
          </h2>

          <div className="p-6 bg-slate-950 text-white rounded-2xl shadow-2xl border border-slate-800 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-200">Chest X-Ray (AP View) — DICOM #RAD-8841</h3>
                <p className="text-xs text-slate-400">Radiologist: Dr. Ananya Verma • Modality: Digital X-Ray</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <ZoomIn size={14} className="text-primary-400" />
                  <span>Zoom: {dicomZoom}%</span>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={dicomZoom}
                    onChange={(e) => setDicomZoom(Number(e.target.value))}
                    className="w-20 accent-primary-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Contrast size={14} className="text-primary-400" />
                  <span>Contrast: {dicomContrast}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={dicomContrast}
                    onChange={(e) => setDicomContrast(Number(e.target.value))}
                    className="w-20 accent-primary-500"
                  />
                </div>
              </div>
            </div>

            <div className="h-64 bg-black rounded-xl border border-slate-800 flex items-center justify-center relative overflow-hidden">
              <div
                className="text-center space-y-2 transition-all duration-200"
                style={{
                  transform: `scale(${dicomZoom / 100})`,
                  filter: `contrast(${dicomContrast + 50}%)`,
                }}
              >
                <Film size={64} className="mx-auto text-slate-600 animate-pulse" />
                <p className="text-xs font-mono text-slate-400">
                  [ High Resolution DICOM Scan Preview ]
                </p>
                <p className="text-[10px] text-emerald-400 font-mono">
                  No acute cardiopulmonary pathology detected. Clear lung fields.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ColorSwatch({ name, hex, usage, bg, text }) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shadow-sm">
      <div className={`h-16 ${bg} ${text} rounded-lg flex items-center justify-center font-mono font-bold text-xs shadow-inner`}>
        {hex}
      </div>
      <div>
        <h4 className="font-bold text-sm text-slate-900 dark:text-white">{name}</h4>
        <p className="text-[11px] text-slate-500 leading-tight mt-1">{usage}</p>
      </div>
    </div>
  )
}
