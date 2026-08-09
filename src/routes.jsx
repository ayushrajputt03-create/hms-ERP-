import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { FacilityProvider } from '@contexts/FacilityContext'
import AppShell from '@components/AppShell'
import ProtectedRoute from '@components/ProtectedRoute'
import ModuleGate from '@components/ModuleGate'
import LoadingScreen from '@components/LoadingScreen'

const LoginPage = lazy(() => import('@modules/auth/LoginPage'))
const RegisterPage = lazy(() => import('@modules/auth/RegisterPage'))
const ForgotPassword = lazy(() => import('@modules/auth/ForgotPassword'))
const FacilitySetupWizard = lazy(() => import('@modules/auth/FacilitySetupWizard'))
const SuperAdminApp = lazy(() => import('@modules/super-admin/SuperAdminApp'))

const DashboardPage = lazy(() => import('@modules/dashboard/DashboardPage'))
const StaffListPage = lazy(() => import('@modules/staff/StaffListPage'))
const FacilitySettings = lazy(() => import('@modules/admin/FacilitySettings'))
const AuditLogViewer = lazy(() => import('@modules/admin/AuditLogViewer'))

const PatientListPage = lazy(() => import('@modules/patients/PatientListPage'))
const PatientForm = lazy(() => import('@modules/patients/PatientForm'))
const PatientProfile = lazy(() => import('@modules/patients/PatientProfile'))

const AppointmentCalendar = lazy(() => import('@modules/opd/AppointmentCalendar'))
const QueueScreen = lazy(() => import('@modules/opd/QueueScreen'))
const ConsultationScreen = lazy(() => import('@modules/opd/ConsultationScreen'))
const OPDRegistrationForm = lazy(() => import('@modules/opd/OPDRegistrationForm'))
const SlotBookingPage = lazy(() => import('@modules/opd/SlotBookingPage'))
const AvailabilitySettings = lazy(() => import('@modules/opd/AvailabilitySettings'))

const QRBookingPage = lazy(() => import('@modules/public/QRBookingPage'))

const PharmacyPage = lazy(() => import('@modules/pharmacy/PharmacyPage'))
const LabPage = lazy(() => import('@modules/lab/LabPage'))
const BillingPage = lazy(() => import('@modules/billing/BillingPage'))
const InvoiceView = lazy(() => import('@modules/billing/InvoiceView'))
const ReportsPage = lazy(() => import('@modules/reports/ReportsPage'))
const AccountsPage = lazy(() => import('@modules/accounts/AccountsPage'))

const IPDPage = lazy(() => import('@modules/ipd/IPDPage'))
const AdmissionForm = lazy(() => import('@modules/ipd/AdmissionForm'))
const AdmissionDetail = lazy(() => import('@modules/ipd/AdmissionDetail'))

function Loader() {
  return <LoadingScreen message="Loading module..." />
}

function FacilityRoutes() {
  const { staffProfile } = useAuth()
  const facilityId = staffProfile?.facilityId

  if (!facilityId || staffProfile?.pending) {
    return <Navigate to="/setup" replace />
  }

  return (
    <FacilityProvider facilityId={facilityId}>
      <AppShell />
    </FacilityProvider>
  )
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/super-admin/*" element={<SuperAdminApp />} />

        <Route path="/book/:facilityId" element={<QRBookingPage />} />

        <Route path="/setup" element={
          <ProtectedRoute>
            <FacilitySetupWizard />
          </ProtectedRoute>
        } />

        <Route element={
          <ProtectedRoute>
            <FacilityRoutes />
          </ProtectedRoute>
        }>
          <Route index element={<DashboardPage />} />

          {/* Patients module */}
          <Route path="patients" element={
            <ModuleGate module="patients"><PatientListPage /></ModuleGate>
          } />
          <Route path="patients/new" element={
            <ModuleGate module="patients"><PatientForm /></ModuleGate>
          } />
          <Route path="patients/:patientId" element={
            <ModuleGate module="patients"><PatientProfile /></ModuleGate>
          } />
          <Route path="patients/:patientId/edit" element={
            <ModuleGate module="patients"><PatientForm /></ModuleGate>
          } />

          {/* OPD module */}
          <Route path="opd" element={
            <ModuleGate module="opd"><AppointmentCalendar /></ModuleGate>
          } />
          <Route path="opd/register" element={
            <ModuleGate module="opd"><OPDRegistrationForm /></ModuleGate>
          } />
          <Route path="opd/slots" element={
            <ModuleGate module="opd"><SlotBookingPage /></ModuleGate>
          } />
          <Route path="opd/availability" element={
            <ModuleGate module="opd"><AvailabilitySettings /></ModuleGate>
          } />
          <Route path="opd/queue" element={
            <ModuleGate module="opd"><QueueScreen /></ModuleGate>
          } />
          <Route path="opd/consultation/:visitId" element={
            <ModuleGate module="opd"><ConsultationScreen /></ModuleGate>
          } />

          {/* Staff module */}
          <Route path="staff" element={
            <ModuleGate module="staff"><StaffListPage /></ModuleGate>
          } />

          {/* Admin module */}
          <Route path="admin" element={
            <ModuleGate module="admin"><FacilitySettings /></ModuleGate>
          } />
          <Route path="admin/audit" element={
            <ModuleGate module="admin"><AuditLogViewer /></ModuleGate>
          } />

          {/* IPD module */}
          <Route path="ipd" element={
            <ModuleGate module="ipd"><IPDPage /></ModuleGate>
          } />
          <Route path="ipd/admit" element={
            <ModuleGate module="ipd"><AdmissionForm /></ModuleGate>
          } />
          <Route path="ipd/admission/:admissionId" element={
            <ModuleGate module="ipd"><AdmissionDetail /></ModuleGate>
          } />

          {/* Pharmacy module */}
          <Route path="pharmacy" element={
            <ModuleGate module="pharmacy"><PharmacyPage /></ModuleGate>
          } />

          {/* Lab module */}
          <Route path="lab" element={
            <ModuleGate module="lab"><LabPage /></ModuleGate>
          } />

          {/* Billing module */}
          <Route path="billing" element={
            <ModuleGate module="billing"><BillingPage /></ModuleGate>
          } />
          <Route path="billing/invoice/:invoiceId" element={
            <ModuleGate module="billing"><InvoiceView /></ModuleGate>
          } />

          {/* Reports module */}
          <Route path="reports" element={
            <ModuleGate module="reports"><ReportsPage /></ModuleGate>
          } />

          {/* Accounts & Payroll module */}
          <Route path="accounts" element={
            <ModuleGate module="accounts"><AccountsPage /></ModuleGate>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
