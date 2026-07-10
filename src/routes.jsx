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
        {/* Public auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Super Admin — independent app */}
        <Route path="/super-admin/*" element={<SuperAdminApp />} />

        {/* Facility setup */}
        <Route path="/setup" element={
          <ProtectedRoute>
            <FacilitySetupWizard />
          </ProtectedRoute>
        } />

        {/* Main facility app */}
        <Route element={
          <ProtectedRoute>
            <FacilityRoutes />
          </ProtectedRoute>
        }>
          <Route index element={<DashboardPage />} />

          {/* Staff module */}
          <Route path="staff" element={
            <ModuleGate module="staff">
              <StaffListPage />
            </ModuleGate>
          } />

          {/* Admin module */}
          <Route path="admin" element={
            <ModuleGate module="admin">
              <FacilitySettings />
            </ModuleGate>
          } />
          <Route path="admin/audit" element={
            <ModuleGate module="admin">
              <AuditLogViewer />
            </ModuleGate>
          } />

          {/* Placeholder routes for future modules */}
          <Route path="patients/*" element={
            <ModuleGate module="patients">
              <PlaceholderModule name="Patients" />
            </ModuleGate>
          } />
          <Route path="opd/*" element={
            <ModuleGate module="opd">
              <PlaceholderModule name="OPD" />
            </ModuleGate>
          } />
          <Route path="ipd/*" element={
            <ModuleGate module="ipd">
              <PlaceholderModule name="IPD" />
            </ModuleGate>
          } />
          <Route path="pharmacy/*" element={
            <ModuleGate module="pharmacy">
              <PlaceholderModule name="Pharmacy" />
            </ModuleGate>
          } />
          <Route path="lab/*" element={
            <ModuleGate module="lab">
              <PlaceholderModule name="Lab / Diagnostics" />
            </ModuleGate>
          } />
          <Route path="billing/*" element={
            <ModuleGate module="billing">
              <PlaceholderModule name="Billing" />
            </ModuleGate>
          } />
          <Route path="reports/*" element={
            <ModuleGate module="reports">
              <PlaceholderModule name="Reports" />
            </ModuleGate>
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
