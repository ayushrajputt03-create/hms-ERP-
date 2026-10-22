import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

const CHUNK_RETRY_WINDOW_MS = 30_000

export function isStaleChunkError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('failed to fetch dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('loading chunk')
    || message.includes('chunkloaderror')
}

function reloadWithFreshAssets() {
  const retryKey = `hms-chunk-retry:${window.location.pathname}`
  const lastRetry = Number(window.sessionStorage.getItem(retryKey) || 0)
  if (Date.now() - lastRetry < CHUNK_RETRY_WINDOW_MS) return false

  window.sessionStorage.setItem(retryKey, String(Date.now()))
  const url = new URL(window.location.href)
  url.searchParams.set('_app_update', String(Date.now()))
  window.location.replace(url.toString())
  return true
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error) {
    if (isStaleChunkError(error)) reloadWithFreshAssets()
  }

  handleReload = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('_reload', String(Date.now()))
    window.location.replace(url.toString())
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <AlertTriangle size={48} />
          <h2>{isStaleChunkError(this.state.error) ? 'App update available' : 'Something went wrong'}</h2>
          <p>
            {isStaleChunkError(this.state.error)
              ? 'A newer HMS ERP version was deployed. Refresh once to load the latest files.'
              : (this.state.error?.message || 'An unexpected error occurred.')}
          </p>
          <button onClick={this.handleReload} className="btn btn-primary">
            Refresh App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
