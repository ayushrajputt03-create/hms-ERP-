export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  FACILITY_ADMIN: 'facility_admin',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  RECEPTIONIST: 'receptionist',
  PHARMACIST: 'pharmacist',
  LAB_TECH: 'lab_tech',
  BILLING_STAFF: 'billing_staff',
}

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  facility_admin: 'Facility Admin',
  doctor: 'Doctor',
  nurse: 'Nurse / Ward Staff',
  receptionist: 'Receptionist / Front Desk',
  pharmacist: 'Pharmacist',
  lab_tech: 'Lab Technician',
  billing_staff: 'Billing / Accounts',
}

export const MODULES = {
  DASHBOARD: 'dashboard',
  PATIENTS: 'patients',
  OPD: 'opd',
  IPD: 'ipd',
  PHARMACY: 'pharmacy',
  LAB: 'lab',
  BILLING: 'billing',
  STAFF: 'staff',
  ADMIN: 'admin',
  REPORTS: 'reports',
  ACCOUNTS: 'accounts',
}

export const MODULE_LABELS = {
  dashboard: 'Dashboard',
  patients: 'Patients',
  opd: 'OPD',
  ipd: 'IPD / Admission',
  pharmacy: 'Pharmacy',
  lab: 'Lab / Diagnostics',
  billing: 'Billing & Invoicing',
  staff: 'Staff Management',
  admin: 'Administration',
  reports: 'Reports & Analytics',
  accounts: 'Accounts & Payroll',
}

export const FACILITY_TYPES = {
  SOLO_CLINIC: 'solo_clinic',
  NURSING_HOME: 'nursing_home',
  MULTI_SPECIALTY: 'multi_specialty',
  DIAGNOSTIC_LAB: 'diagnostic_lab',
}

export const FACILITY_TYPE_LABELS = {
  solo_clinic: 'Solo Clinic / Small OPD',
  nursing_home: 'Nursing Home',
  multi_specialty: 'Multi-Specialty Hospital',
  diagnostic_lab: 'Diagnostic / Pathology Lab',
}

export const FACILITY_TYPE_MODULES = {
  solo_clinic: {
    dashboard: true, patients: true, opd: true, ipd: false,
    pharmacy: false, lab: false, billing: true, staff: true,
    admin: true, reports: true,
  },
  nursing_home: {
    dashboard: true, patients: true, opd: true, ipd: true,
    pharmacy: true, lab: false, billing: true, staff: true,
    admin: true, reports: true,
  },
  multi_specialty: {
    dashboard: true, patients: true, opd: true, ipd: true,
    pharmacy: true, lab: true, billing: true, staff: true,
    admin: true, reports: true,
  },
  diagnostic_lab: {
    dashboard: true, patients: true, opd: false, ipd: false,
    pharmacy: false, lab: true, billing: true, staff: true,
    admin: true, reports: true,
  },
}

export const GST_RATES = {
  CONSULTATION: 18,
  PHARMACY_GOODS: 12,
  LAB_SERVICES: 18,
  BED_CHARGES: 18,
  EXEMPT: 0,
}

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

export const PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'cheque']

export const PAYMENT_MODE_LABELS = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
}
