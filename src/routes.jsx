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

          {/* Placeholder routes for future modules */}
          <Route path="ipd/*" element={
            <ModuleGate module="ipd"><PlaceholderModule name="IPD" /></ModuleGate>
          } />
          <Route path="pharmacy/*" element={
            <ModuleGate module="pharmacy"><PlaceholderModule name="Pharmacy" /></ModuleGate>
          } />
          <Route path="lab/*" element={
            <ModuleGate module="lab"><PlaceholderModule name="Lab / Diagnostics" /></ModuleGate>
          } />
          <Route path="billing/*" element={
            <ModuleGate module="billing"><PlaceholderModule name="Billing" /></ModuleGate>
          } />
          <Route path="reports/*" element={
            <ModuleGate module="reports"><PlaceholderModule name="Reports" /></ModuleGate>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function PlaceholderModule({ name }) {
  return (
    <div className="placeholder-module">
      <h2>{name}</h2>
      <p>This module is coming soon. The foundation is ready — module implementation follows in the next phase.</p>
    </div>
  )
}
