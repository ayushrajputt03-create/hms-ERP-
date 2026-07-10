import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@contexts/AuthContext'
import { ToastProvider } from '@components/Toast'
import ErrorBoundary from '@components/ErrorBoundary'
import AppRoutes from './routes'
import './app.css'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
