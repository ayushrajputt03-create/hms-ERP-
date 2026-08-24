import { useState, useEffect, useMemo } from 'react'
import { useFacility } from '@hooks/useFacility'
import { useAuth } from '@hooks/useAuth'
import { subscribeToCollection } from '@lib/db'
import { formatINR, formatDate, toISODate } from '@lib/utils'
import { ROLES } from '@lib/constants'
import StatCard from '@components/StatCard'
import {
  BarChart3, Stethoscope, BedDouble, IndianRupee, Pill, Download, Lock
} from 'lucide-react'

// The ledger, trial balance and day book used to live here as an "Accounts"
// tab. They now have their own module (@modules/accounts) alongside expenses
// and payroll — kept in one place rather than two so the two views cannot
// drift apart.
const ALL_TABS = [
  { key: 'opd', label: 'OPD', icon: Stethoscope },
  { key: 'ipd', label: 'IPD', icon: BedDouble },
  { key: 'revenue', label: 'Revenue', icon: IndianRupee },
  { key: 'pharmacy', label: 'Pharmacy', icon: Pill },
]

// Reports visibility is scoped by role (Phase 7):
//  - billing_staff: collection & dues only — no clinical stats (OPD/IPD/pharmacy)
//  - doctor: only their own numbers (handled by a dedicated view below)
//  - facility_admin/super_admin: everything (IPD tab still gated by module)
function tabsForRole(role, ipdEnabled) {
  if (role === ROLES.BILLING_STAFF) return ALL_TABS.filter((t) => t.key === 'revenue')
  return ALL_TABS.filter((t) => t.key !== 'ipd' || ipdEnabled)
}

function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const { facilityId, isModuleEnabled } = useFacility()
  const { staffProfile, user } = useAuth()
  const role = staffProfile?.role
  const isDoctor = role === ROLES.DOCTOR
  const tabs = useMemo(() => tabsForRole(role, isModuleEnabled('ipd')), [role, isModuleEnabled])
  const [tab, setTab] = useState(tabs[0]?.key || 'revenue')

  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key || 'revenue')
  }, [tabs, tab])
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return toISODate(d)
  })
  const [to, setTo] = useState(toISODate(new Date()))

  const [visits, setVisits] = useState([])
  const [admissions, setAdmissions] = useState([])
  const [billing, setBilling] = useState([])
  const [sales, setSales] = useState([])
  const [wards, setWards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!facilityId || !role) { setLoading(false); return }

    const ALLOWED_ROLES = [ROLES.SUPER_ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.BILLING_STAFF]
    if (!ALLOWED_ROLES.includes(role)) {
      setLoading(false)
      return
    }

    const unsubs = []

    if (role === ROLES.SUPER_ADMIN || role === ROLES.FACILITY_ADMIN) {
      unsubs.push(
        subscribeToCollection(`facilities/${facilityId}/opdVisits`, setVisits),
        subscribeToCollection(`facilities/${facilityId}/ipd/admissions`, setAdmissions),
        subscribeToCollection(`facilities/${facilityId}/billing`, (data) => { setBilling(data); setLoading(false) }),
        subscribeToCollection(`facilities/${facilityId}/pharmacy/sales`, setSales),
        subscribeToCollection(`facilities/${facilityId}/ipd/wards`, setWards)
      )
    } else if (role === ROLES.DOCTOR) {
      const myId = user?.uid || staffProfile?.uid
      unsubs.push(
        subscribeToCollection(`facilities/${facilityId}/opdVisits`, setVisits, { filter: { 'data->>doctorId': myId } }),
        subscribeToCollection(`facilities/${facilityId}/ipd/admissions`, setAdmissions, { filter: { 'data->>doctorId': myId } })
      )
      setBilling([])
      setSales([])
      setWards([])
      setLoading(false)
    } else if (role === ROLES.BILLING_STAFF) {
      unsubs.push(
        subscribeToCollection(`facilities/${facilityId}/billing`, (data) => { setBilling(data); setLoading(false) })
      )
      setVisits([])
      setAdmissions([])
      setSales([])
      setWards([])
    }

    return () => unsubs.forEach((fn) => fn())
  }, [facilityId, role, user, staffProfile])

  const range = useMemo(() => ({
    fromTs: new Date(from + 'T00:00:00').getTime(),
    toTs: new Date(to + 'T23:59:59').getTime(),
  }), [from, to])

  const inRange = (ts) => ts >= range.fromTs && ts <= range.toTs

  const ALLOWED_ROLES = [ROLES.SUPER_ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.BILLING_STAFF]
  if (role && !ALLOWED_ROLES.includes(role)) {
    return (
      <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
        <Lock size={48} className="text-muted" />
        <h3>Access Denied</h3>
        <p className="text-muted">You do not have permission to view reports.</p>
      </div>
    )
  }

  if (loading) return <div className="empty-state">Loading report data...</div>

  // Doctors only ever see their own activity — never a full doctor list.
  if (isDoctor) {
    const myId = user?.uid || staffProfile?.uid
    const myName = staffProfile?.name
    const myVisits = visits.filter(
      (v) => (v.doctorId && v.doctorId === myId) || (myName && v.doctorName === myName)
    )
    return (
      <DoctorOwnReport
        doctorName={myName || 'You'}
        visits={myVisits.filter((v) => inRange(v.visitDate || v.createdAt || 0))}
        rangeLabel={`${formatDate(range.fromTs)} — ${formatDate(range.toTs)}`}
        from={from} to={to} setFrom={setFrom} setTo={setTo}
      />
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><BarChart3 size={22} /> Reports & Analytics</h2>
          <p>{formatDate(range.fromTs)} — {formatDate(range.toTs)}</p>
        </div>
        <div className="report-filters" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'opd' && <OPDReport visits={visits.filter((v) => inRange(v.visitDate || v.createdAt || 0))} />}
      {tab === 'ipd' && isModuleEnabled('ipd') && <IPDReport admissions={admissions} wards={wards} inRange={inRange} />}
      {tab === 'revenue' && (
        <div>
          <RevenueReport billing={billing.filter((b) => inRange(b.invoiceDate || b.createdAt || 0))} />
          <DailyCollectionSummary billing={billing} />
        </div>
      )}
      {tab === 'pharmacy' && <PharmacyReport sales={sales.filter((s) => inRange(s.saleDate || 0))} />}
    </div>
  )
}

function OPDReport({ visits }) {
  const completed = visits.filter((v) => v.status === 'completed')
  const byDoctor = useMemo(() => {
    const map = {}
    visits.forEach((v) => {
      const key = v.doctorName || 'Unassigned'
      if (!map[key]) map[key] = { total: 0, completed: 0, noShow: 0 }
      map[key].total++
      if (v.status === 'completed') map[key].completed++
      if (v.status === 'no_show') map[key].noShow++
    })
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [visits])

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={Stethoscope} label="Total Visits" value={visits.length} color="teal" />
        <StatCard icon={Stethoscope} label="Completed" value={completed.length} color="green" />
        <StatCard icon={Stethoscope} label="No-shows" value={visits.filter((v) => v.status === 'no_show').length} color="red" />
      </div>
      <ReportTable
        title="Doctor-wise Breakdown"
        headers={['Doctor', 'Total Visits', 'Completed', 'No-shows']}
        rows={byDoctor.map(([name, d]) => [name, d.total, d.completed, d.noShow])}
        filename="opd-report.csv"
      />
    </div>
  )
}

function IPDReport({ admissions, wards, inRange }) {
  const admitted = admissions.filter((a) => inRange(a.admissionDate || 0))
  const discharged = admissions.filter((a) => a.status === 'discharged' && inRange(a.dischargedAt || 0))
  const avgStay = discharged.length
    ? (discharged.reduce((s, a) => s + (a.stayDays || 1), 0) / discharged.length).toFixed(1)
    : 0

  const totalBeds = wards.reduce((s, w) => s + Object.keys(w.beds || {}).length, 0)
  const occupiedBeds = wards.reduce(
    (s, w) => s + Object.values(w.beds || {}).filter((b) => b.status === 'occupied').length, 0
  )
  const occupancy = totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={BedDouble} label="Admissions (period)" value={admitted.length} color="teal" />
        <StatCard icon={BedDouble} label="Discharges (period)" value={discharged.length} color="green" />
        <StatCard icon={BedDouble} label="Avg Length of Stay" value={`${avgStay} days`} color="blue" />
        <StatCard icon={BedDouble} label="Current Occupancy" value={`${occupancy}%`} sub={`${occupiedBeds}/${totalBeds} beds`} color="amber" />
      </div>
      <ReportTable
        title="Admissions in Period"
        headers={['Patient', 'UHID', 'Ward/Bed', 'Doctor', 'Admitted', 'Status', 'Stay (days)']}
        rows={admitted.map((a) => [
          a.patientName, a.patientUhid, `${a.wardName}/${a.bedName}`, a.doctorName,
          formatDate(a.admissionDate), a.status, a.stayDays || '—',
        ])}
        filename="ipd-report.csv"
      />
    </div>
  )
}

function RevenueReport({ billing }) {
  const invoices = billing.filter((b) => b.type === 'invoice' && b.status !== 'cancelled')
  const totalBilled = invoices.reduce((s, i) => s + (i.grandTotal || 0), 0)
  const totalCollected = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0)

  const byType = useMemo(() => {
    const map = { opd_consultation: 0, ipd_bed_charges: 0, pharmacy: 0, lab: 0, manual: 0, other: 0 }
    invoices.forEach((inv) => {
      (inv.items || []).forEach((item) => {
        const key = map[item.type] !== undefined ? item.type : 'other'
        map[key] += item.amount || 0
      })
    })
    return map
  }, [invoices])

  const labels = {
    opd_consultation: 'OPD', ipd_bed_charges: 'IPD', pharmacy: 'Pharmacy',
    lab: 'Lab', manual: 'Manual/Misc', other: 'Other',
  }

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={IndianRupee} label="Total Billed" value={formatINR(totalBilled)} sub={`${invoices.length} invoices`} color="teal" />
        <StatCard icon={IndianRupee} label="Collected" value={formatINR(totalCollected)} color="green" />
        <StatCard icon={IndianRupee} label="Outstanding Due" value={formatINR(totalBilled - totalCollected)} color="red" />
      </div>
      <ReportTable
        title="Revenue by Department"
        headers={['Department', 'Billed Amount']}
        rows={Object.entries(byType).filter(([, v]) => v > 0).map(([k, v]) => [labels[k], v])}
        filename="revenue-report.csv"
      />
      <ReportTable
        title="Invoices"
        headers={['Invoice #', 'Patient', 'Date', 'Total', 'Paid', 'Due']}
        rows={invoices.map((i) => [
          i.invoiceNumber, i.patientName, formatDate(i.invoiceDate),
          i.grandTotal || 0, i.paidAmount || 0, (i.grandTotal || 0) - (i.paidAmount || 0),
        ])}
        filename="invoices-report.csv"
      />
    </div>
  )
}

function DailyCollectionSummary({ billing }) {
  const [date, setDate] = useState(() => toISODate(new Date()))

  const range = useMemo(() => {
    const start = new Date(date + 'T00:00:00').getTime()
    const end = new Date(date + 'T23:59:59').getTime()
    return { start, end }
  }, [date])

  const paymentsOnDate = useMemo(() => {
    const list = []
    const invoices = billing.filter((b) => b.type === 'invoice' && b.status !== 'cancelled')
    invoices.forEach((inv) => {
      const payments = inv.payments || []
      payments.forEach((p) => {
        const pDate = p.paymentDate || p.recordedAt
        if (pDate >= range.start && pDate <= range.end) {
          list.push({
            invoiceNumber: inv.invoiceNumber,
            patientName: inv.patientName,
            amount: Number(p.amount) || 0,
            mode: p.mode,
            reference: p.referenceNumber || '—',
          })
        }
      })
    })
    return list
  }, [billing, range])

  const totalsByMode = useMemo(() => {
    const modes = { cash: 0, upi: 0, card: 0, bank_transfer: 0, cheque: 0 }
    paymentsOnDate.forEach((p) => {
      const m = p.mode
      if (modes[m] !== undefined) {
        modes[m] += p.amount
      } else {
        if (!modes.other) modes.other = 0
        modes.other += p.amount
      }
    })
    return modes
  }, [paymentsOnDate])

  const grandTotal = Object.values(totalsByMode).reduce((sum, v) => sum + v, 0)

  const modeLabels = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
    other: 'Other'
  }

  return (
    <div className="settings-section" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
        <h3>Daily Collection Summary</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 'medium' }}>Collection Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 13 }}
          />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {Object.entries(totalsByMode).map(([mode, val]) => (
          <div key={mode} className="stat-card" style={{ padding: 12 }}>
            <div className="stat-label" style={{ fontSize: 12 }}>{modeLabels[mode] || mode}</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{formatINR(val)}</div>
          </div>
        ))}
        <div className="stat-card" style={{ padding: 12, border: '1px solid var(--primary-color, #052659)' }}>
          <div className="stat-label" style={{ fontSize: 12, fontWeight: 'bold' }}>Grand Total</div>
          <div className="stat-value" style={{ fontSize: 18, color: 'var(--primary-color, #052659)' }}>{formatINR(grandTotal)}</div>
        </div>
      </div>

      {paymentsOnDate.length === 0 ? (
        <p className="text-muted">No payments recorded on {formatDate(range.start)}.</p>
      ) : (
        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Patient</th>
                <th>Payment Mode</th>
                <th>Reference #</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {paymentsOnDate.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.invoiceNumber}</td>
                  <td>{p.patientName}</td>
                  <td><span className="badge badge-outline">{modeLabels[p.mode] || p.mode}</span></td>
                  <td>{p.reference}</td>
                  <td>{formatINR(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PharmacyReport({ sales }) {
  const totalValue = sales.reduce((s, x) => s + (x.total || 0), 0)
  const totalUnits = sales.reduce((s, x) => s + (x.items || []).reduce((n, it) => n + (it.qty || 0), 0), 0)

  const topMedicines = useMemo(() => {
    const map = {}
    sales.forEach((s) => (s.items || []).forEach((it) => {
      if (!map[it.name]) map[it.name] = { qty: 0, value: 0 }
      map[it.name].qty += it.qty || 0
      map[it.name].value += it.amount || 0
    }))
    return Object.entries(map).sort((a, b) => b[1].qty - a[1].qty)
  }, [sales])

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={Pill} label="Sales Value" value={formatINR(totalValue)} sub={`${sales.length} sales`} color="teal" />
        <StatCard icon={Pill} label="Units Dispensed" value={totalUnits} color="blue" />
      </div>
      <ReportTable
        title="Top Dispensed Medicines"
        headers={['Medicine', 'Units', 'Value']}
        rows={topMedicines.map(([name, d]) => [name, d.qty, d.value])}
        filename="pharmacy-report.csv"
      />
    </div>
  )
}

// Doctor-scoped view: shows only the signed-in doctor's own visits & revenue.
// No other doctor's name or numbers are ever rendered here.
function DoctorOwnReport({ doctorName, visits, rangeLabel, from, to, setFrom, setTo }) {
  const completed = visits.filter((v) => v.status === 'completed')
  const revenue = completed.reduce((s, v) => s + (Number(v.consultationFee) || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><BarChart3 size={22} /> My Reports — Dr. {doctorName}</h2>
          <p>{rangeLabel}</p>
        </div>
        <div className="report-filters" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={Stethoscope} label="My Visits" value={visits.length} color="teal" />
        <StatCard icon={Stethoscope} label="Completed" value={completed.length} color="green" />
        <StatCard icon={IndianRupee} label="My Revenue" value={formatINR(revenue)} sub="from consultation fees" color="blue" />
      </div>

      <ReportTable
        title="My Visits"
        headers={['Patient', 'UHID', 'Date', 'Status', 'Fee']}
        rows={visits
          .slice()
          .sort((a, b) => (b.visitDate || b.createdAt || 0) - (a.visitDate || a.createdAt || 0))
          .map((v) => [
            v.patientName, v.patientUhid, formatDate(v.visitDate || v.createdAt),
            v.status, Number(v.consultationFee) || 0,
          ])}
        filename="my-report.csv"
      />
    </div>
  )
}

function ReportTable({ title, headers, rows, filename }) {
  return (
    <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3>{title}</h3>
        <button className="btn btn-outline btn-sm" onClick={() => downloadCSV(filename, headers, rows)} disabled={rows.length === 0}>
          <Download size={13} /> Export CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">No data in the selected period.</p>
      ) : (
        <div className="data-table-scroll">
          <table className="data-table">
            <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
