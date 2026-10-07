import {
  Activity, BarChart3, BedDouble, CalendarDays, ClipboardList, FlaskConical,
  HeartPulse, Lock, Microscope, Pill, ShieldCheck, Stethoscope, Users,
} from 'lucide-react'

export const EASE = [0.22, 1, 0.36, 1]
export const SPRING = { type: 'spring', stiffness: 280, damping: 26 }
export const SPRING_LIGHT = { type: 'spring', stiffness: 160, damping: 18 }
export const VIEWPORT = { once: true, margin: '-70px' }

export const fadeUp = (y = 26, delay = 0) => ({
  initial: { opacity: 0, y },
  whileInView: { opacity: 1, y: 0 },
  viewport: VIEWPORT,
  transition: { duration: 0.7, delay, ease: EASE },
})

export const navLinks = [
  { label: 'Overview', href: '#services' },
  { label: 'Platform', href: '#platform' },
  { label: 'Why us', href: '#why' },
  { label: 'Use cases', href: '#stories' },
  { label: 'FAQ', href: '#faq' },
]

export const stats = [
  { v: 20, suffix: '+', label: 'Connected hospital modules', note: 'One unified workspace' },
  { v: 1, suffix: '', label: 'Shared patient record', note: 'Across enabled workflows' },
  { v: 9, suffix: '', label: 'Core clinical & operations areas', note: 'Designed to work together' },
  { v: 6, suffix: '', label: 'Role-aware workspaces', note: 'Built around your teams' },
]

export const problems = [
  ['01', 'Paperwork and manual registers'],
  ['02', 'Disconnected departments'],
  ['03', 'Appointment queues'],
  ['04', 'Inventory blind spots'],
  ['05', 'Delayed lab reports'],
  ['06', 'Scattered patient information'],
]

export const modules = [
  { n: 'Patient records', copy: 'Unified demographics, UHID, history and visit timeline.', Icon: Users },
  { n: 'OPD & queue', copy: 'Appointments, token queue and full consultation workflow.', Icon: CalendarDays },
  { n: 'IPD & beds', copy: 'Admissions, live bed board and ward management.', Icon: BedDouble },
  { n: 'Pharmacy stock', copy: 'Inventory, dispensing and low-stock alerts.', Icon: Pill },
  { n: 'Laboratory', copy: 'Test orders, samples and delivered reports.', Icon: Microscope },
  { n: 'Billing & payments', copy: 'Connected invoices, GST and collections.', Icon: BarChart3 },
]

export const journey = [
  { step: 'Registration', Icon: ClipboardList },
  { step: 'Appointment', Icon: CalendarDays },
  { step: 'Consultation', Icon: Stethoscope },
  { step: 'Laboratory', Icon: FlaskConical },
  { step: 'Pharmacy', Icon: Pill },
  { step: 'Billing', Icon: BarChart3 },
  { step: 'Follow-up', Icon: HeartPulse },
]

export const wards = [
  { name: 'General Ward', total: 12, pattern: [2, 5] },
  { name: 'Private Rooms', total: 8, pattern: [3, 7] },
  { name: 'ICU', total: 6, pattern: [4, 1] },
  { name: 'Emergency', total: 6, pattern: [1, 6] },
]

export const security = [
  { Icon: Lock, t: 'Role-based access', d: 'Every role sees only what it needs.' },
  { Icon: ShieldCheck, t: 'Secure authentication', d: 'Email, Google sign-in & sessions.' },
  { Icon: ClipboardList, t: 'Audit logs', d: 'Meaningful activity is recorded for review.' },
  { Icon: Activity, t: 'Activity tracking', d: 'Meaningful activity, always traceable.' },
]

export const roles = [
  ['Facility admin', 'Configuration, staff and oversight'],
  ['Doctor', 'Appointments, consultations and orders'],
  ['Nurse / ward staff', 'Admissions and ward workflows'],
  ['Receptionist', 'Registration and appointments'],
  ['Pharmacist', 'Inventory and dispensing'],
  ['Billing / accounts', 'Invoices, collections and books'],
]

export const compare = {
  traditional: ['Paperwork', 'Manual registers', 'Delayed reports', 'Limited visibility'],
  hms: ['Digital workflows', 'Connected departments', 'Real-time information', 'Centralized records'],
}

export const testimonials = [
  { name: 'Demo scenario', role: 'Front desk workflow', org: 'Illustrative example', q: 'Patient registration, appointment booking and queue visibility stay in one place.' },
  { name: 'Demo scenario', role: 'Clinical workflow', org: 'Illustrative example', q: 'A shared patient record keeps the care team focused on the next meaningful step.' },
  { name: 'Demo scenario', role: 'Operations workflow', org: 'Illustrative example', q: 'Admissions, beds, diagnostics and billing can stay connected across departments.' },
]

export const faqs = [
  { q: 'What is HMS ERP?', a: 'HMS ERP is a connected hospital operating platform that brings core clinical and administrative workflows — patients, OPD, IPD, pharmacy, laboratory and billing — into one system.' },
  { q: 'Who can use HMS ERP?', a: 'Hospitals, clinics, diagnostic centers and specialty care centers. Configuration adapts to your enabled modules and operational processes.' },
  { q: 'Does it support multiple departments?', a: 'Yes. Every department runs on the same patient record, so handoffs between departments disappear.' },
  { q: 'Can roles and permissions be customized?', a: 'Role-based access is built in, from facility admin to billing staff, with audit trails on meaningful activity.' },
  { q: 'Does it support OPD and IPD?', a: 'Both. OPD covers appointments and consultations; IPD covers admissions, wards, beds and discharge.' },
  { q: 'Can I manage pharmacy and laboratory?', a: 'Yes, pharmacy inventory and dispensing plus laboratory orders, samples and reports are included.' },
]

export const footerCols = [
  ['Product', [['Platform', '#platform'], ['Product tour', '#tour'], ['Pricing', '#pricing']]],
  ['Explore', [['Why HMS', '#why'], ['Workflows', '#operations'], ['Questions', '#faq'], ['Security', '/security']]],
]

export const trustLogos = [
  { Icon: HeartPulse, n: 'Hospitals' }, { Icon: Stethoscope, n: 'Clinics' },
  { Icon: Microscope, n: 'Diagnostic centers' }, { Icon: BedDouble, n: 'Specialty care' },
]

export const pricing = [
  { name: 'Essentials', tagline: 'For clinics & focused teams', price: 'Talk to us', unit: '', features: ['Patients & OPD workflows', 'Billing & payment receipts', 'Role-based workspaces', 'Guided implementation'] },
  { name: 'Hospital', tagline: 'For connected care operations', price: 'Tailored', unit: '', featured: true, badge: 'Recommended', features: ['OPD + IPD + bed board', 'Pharmacy & laboratory', 'Reports & audit logs', 'Department rollout planning'] },
  { name: 'Network', tagline: 'For multi-site organizations', price: 'Custom', unit: '', features: ['Multi-facility configuration', 'Custom workflow planning', 'Implementation support', 'Commercial terms on request'] },
]

export const pricingNote = 'Every facility is different. We will recommend the right modules and rollout plan after a walkthrough.'
