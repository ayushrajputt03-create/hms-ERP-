import {
  Activity, Ambulance, BarChart3, BedDouble, Building2, CalendarDays,
  ClipboardList, Cross, FlaskConical, HeartPulse, Hospital, Lock, Microscope,
  Pill, Rocket, ShieldCheck, Stethoscope, Users,
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
  { label: 'Services', href: '#services' },
  { label: 'Platform', href: '#platform' },
  { label: 'Why us', href: '#why' },
  { label: 'Stories', href: '#stories' },
  { label: 'FAQ', href: '#faq' },
]

export const stats = [
  { v: 20, suffix: '+', label: 'Connected hospital modules', note: 'One unified workspace' },
  { v: 12, suffix: 'k+', label: 'Patient records managed', note: 'Across facilities' },
  { v: 99.9, decimals: 1, suffix: '%', label: 'Reliable uptime', note: 'Cloud infrastructure' },
  { v: 24, suffix: '/7', label: 'Monitoring & support', note: 'Always on-call' },
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
  { Icon: ClipboardList, t: 'Audit logs', d: 'Every clinical action is recorded.' },
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
  { q: 'The entire flow is visible, from the first patient touchpoint to billing.', role: 'Operations lead', org: 'Multi-specialty hospital' },
  { q: 'It brings every team into one clear operational rhythm — no more handoffs.', role: 'Medical superintendent', org: 'City care network' },
  { q: 'The interface is calm, focused and built around how hospital work actually happens.', role: 'Front desk manager', org: 'Clinic group' },
]

export const faqs = [
  { q: 'What is HMS Hospital?', a: 'HMS is a connected hospital operating platform that brings core clinical and administrative workflows — patients, OPD, IPD, pharmacy, laboratory and billing — into one system.' },
  { q: 'Who can use HMS Hospital?', a: 'Hospitals, clinics, diagnostic centers and specialty care centers. Configuration adapts to your enabled modules and operational processes.' },
  { q: 'Does it support multiple departments?', a: 'Yes. Every department runs on the same patient record, so handoffs between departments disappear.' },
  { q: 'Can roles and permissions be customized?', a: 'Role-based access is built in, from facility admin to billing staff, with audit trails on meaningful activity.' },
  { q: 'Does it support OPD and IPD?', a: 'Both. OPD covers appointments and consultations; IPD covers admissions, wards, beds and discharge.' },
  { q: 'Can I manage pharmacy and laboratory?', a: 'Yes, pharmacy inventory and dispensing plus laboratory orders, samples and reports are included.' },
]

export const footerCols = [
  ['Product', ['Platform', 'Features', 'Modules', 'Pricing']],
  ['Company', ['About', 'Careers', 'Contact', 'Partners']],
  ['Resources', ['Blog', 'Docs', 'Support', 'Status']],
]

export const trustLogos = [
  { Icon: Building2, n: 'CityCare Group' },
  { Icon: Hospital, n: 'Apollo North' },
  { Icon: HeartPulse, n: 'LifeBridge' },
  { Icon: Microscope, n: 'MediLab TPA' },
  { Icon: Ambulance, n: 'SwiftCare' },
  { Icon: Cross, n: 'Sanjeevani' },
]

export const pricing = [
  { name: 'Starter', tagline: 'For clinics & small practices', price: '₹9,999', unit: '/month', features: ['Up to 10 staff members', '1 facility', 'Patients & OPD workflows', 'Billing & payment receipts', 'Email support'] },
  { name: 'Growth', tagline: 'For growing hospitals & groups', price: '₹24,999', unit: '/month', featured: true, badge: 'Most popular', features: ['Up to 100 staff members', 'Unlimited facilities', 'OPD + IPD + live bed board', 'Pharmacy & laboratory', 'Reports & audit logs', 'Priority support'] },
  { name: 'Enterprise', tagline: 'For multi-specialty & networks', price: 'Custom', unit: '', features: ['Unlimited staff & facilities', 'Network-wise dashboards', 'Custom modules & integrations', 'Dedicated account manager', 'Onboarding, training & SLA'] },
]

export const pricingNote = 'Every plan is cloud-hosted, includes free onboarding setup, and has no long-term lock-in.'