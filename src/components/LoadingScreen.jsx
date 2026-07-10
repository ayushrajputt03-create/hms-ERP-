import { Activity } from 'lucide-react'

export default function LoadingScreen({ message = 'Loading...' }) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <Activity size={40} className="loading-icon" />
        <p>{message}</p>
      </div>
    </div>
  )
}
