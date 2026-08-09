import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchPatients, formatAgeSex } from '@lib/patients'
import { formatDate } from '@lib/utils'
import { Search, Loader, UserPlus, FileText } from 'lucide-react'

// Dashboard-wide patient lookup by name, phone or UHID.
//
// The query runs on the server (search_patients RPC) rather than filtering a
// subscribed collection, so it stays usable on a tenant with a large register.
// Typing is debounced and every response carries the request it answered, so a
// slow early response can never overwrite a newer one.
export default function PatientSearchBox() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      setError('')
      setLoading(false)
      return
    }
    setLoading(true)
    const seq = ++latest.current
    const timer = setTimeout(async () => {
      try {
        const rows = await searchPatients(q)
        if (seq !== latest.current) return // a newer keystroke already won
        setResults(rows)
        setError('')
      } catch (err) {
        if (seq !== latest.current) return
        console.error('Patient search error:', err)
        setResults([])
        setError('Search failed. Please try again.')
      } finally {
        if (seq === latest.current) {
          setLoading(false)
          setSearched(true)
        }
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="dashboard-section patient-search-box">
      <h3><Search size={18} /> Search Patient</h3>
      <div className="patient-search-input">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, mobile number or UHID..."
          aria-label="Search patients by name, mobile number or UHID"
        />
        {loading && <Loader size={16} className="spin" />}
      </div>

      {error && <div className="auth-error">{error}</div>}

      {searched && !loading && results.length === 0 && !error && (
        <div className="empty-state">
          <p>No patient matches “{query.trim()}”.</p>
          <button className="btn btn-outline" onClick={() => navigate('/opd/register')}>
            <UserPlus size={14} /> Register New Patient
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="patient-search-results">
          {results.map((p) => (
            <div key={p.id} className="patient-search-row">
              <div className="patient-search-identity">
                <strong>{p.name}</strong>
                <span className="font-mono uhid-display">{p.uhid || 'No UHID'}</span>
                <span className="text-muted">{formatAgeSex(p)}</span>
                {p.phone && <span className="text-muted">{p.phone}</span>}
              </div>
              <div className="patient-search-lastvisit">
                {p.lastVisit?.visitDate ? (
                  <>
                    <span>Last visit {formatDate(p.lastVisit.visitDate, 'date')}</span>
                    <span className="text-muted">
                      {[p.lastVisit.departmentName, p.lastVisit.doctorName && `Dr. ${p.lastVisit.doctorName}`]
                        .filter(Boolean).join(' · ') || '—'}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">No visits yet</span>
                )}
              </div>
              <div className="patient-search-actions">
                <button className="btn btn-outline btn-sm" onClick={() => navigate(`/patients/${p.id}`)}>
                  <FileText size={13} /> History
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/opd/register')}>
                  <UserPlus size={13} /> New Visit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
