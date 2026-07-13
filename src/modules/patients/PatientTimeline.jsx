import { formatDate } from '@lib/utils'
import { Stethoscope, BedDouble, FlaskConical, Receipt } from 'lucide-react'

export default function PatientTimeline({ visits, admissions, labOrders, invoices }) {
  const events = [
    ...visits.map((v) => ({
      type: 'visit', date: v.visitDate || v.createdAt, icon: Stethoscope, color: 'teal',
      title: `OPD Visit${v.tokenNumber ? ` #${v.tokenNumber}` : ''}`,
      sub: [v.chiefComplaint, v.diagnosis].filter(Boolean).join(' — ') || 'Consultation',
      status: v.status,
    })),
    ...admissions.map((a) => ({
      type: 'admission', date: a.admissionDate || a.createdAt, icon: BedDouble, color: 'blue',
      title: `IPD Admission${a.ward ? ` — ${a.ward}` : ''}`,
      sub: a.reason || 'Inpatient admission',
      status: a.status,
    })),
    ...labOrders.map((l) => ({
      type: 'lab', date: l.orderDate || l.createdAt, icon: FlaskConical, color: 'purple',
      title: `Lab: ${l.testName || 'Test'}`,
      sub: l.result || l.status || 'Pending',
      status: l.status,
    })),
    ...invoices.map((b) => ({
      type: 'bill', date: b.invoiceDate || b.createdAt, icon: Receipt, color: 'amber',
      title: `Invoice ${b.invoiceNumber || ''}`,
      sub: b.totalAmount ? `₹${b.totalAmount}` : '',
      status: b.paymentStatus || b.status,
    })),
  ].sort((a, b) => (b.date || 0) - (a.date || 0))

  if (events.length === 0) {
    return <div className="empty-state">No activity recorded for this patient yet.</div>
  }

  return (
    <div className="patient-timeline">
      {events.map((evt, i) => {
        const Icon = evt.icon
        return (
          <div key={i} className="timeline-item">
            <div className={`timeline-dot timeline-dot-${evt.color}`}>
              <Icon size={14} />
            </div>
            <div className="timeline-content">
              <div className="timeline-header">
                <span className="timeline-title">{evt.title}</span>
                <span className="timeline-date">{formatDate(evt.date, 'datetime')}</span>
              </div>
              {evt.sub && <p className="timeline-sub">{evt.sub}</p>}
              {evt.status && (
                <span className={`badge badge-${evt.status === 'completed' || evt.status === 'paid' ? 'success' : evt.status === 'in_progress' ? 'warning' : 'muted'}`}>
                  {evt.status}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
