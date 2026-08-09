import { useState, useEffect, useRef } from 'react'
import { Stethoscope } from 'lucide-react'
import { usePatientStats, STAT_RANGES, formatCount } from '@hooks/usePatientStats'

const RANGE_SUBS = {
  today: 'visits today',
  week: 'visits this week (Mon–Sun)',
  month: 'visits this calendar month',
}

// OPD footfall with a range toggle. Counts VISITS, not registrations — a
// patient who has been on the register for two years and comes in twice this
// week is two visits here and nothing on the dashboard's registration cards.
//
// The toggle is local state over data the hook already holds, so switching
// range is instant and issues no query. Defaults to Today, which is what the
// desk is looking at the rest of the time.
// `refreshKey` lets a screen that already watches opdVisits live (the queue)
// pull a fresh count when a visit is registered or cancelled, instead of
// leaving a stale number on screen until reload. Screens without a live
// subscription simply omit it.
export default function OpdFootfallCard({ refreshKey }) {
  const [range, setRange] = useState('today')
  const { stats, loading, error, refresh } = usePatientStats()

  const seen = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === seen.current) return
    seen.current = refreshKey
    refresh()
  }, [refreshKey, refresh])

  const value = formatCount(stats?.opd?.[range], { loading })

  return (
    <div className="opd-footfall">
      <div className="opd-footfall-main">
        <span className="opd-footfall-icon"><Stethoscope size={22} /></span>
        <div>
          <span className="opd-footfall-value">{value}</span>
          {/* On failure the sub-line says so outright. A card reading "—" with
              "visits today" under it invites the reader to assume nobody came. */}
          <span className="opd-footfall-label">
            {error ? 'count unavailable' : RANGE_SUBS[range]}
          </span>
        </div>
      </div>
      <div className="opd-footfall-toggle" role="group" aria-label="OPD footfall range">
        {STAT_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`btn btn-sm ${range === r.key ? 'btn-primary' : 'btn-outline'}`}
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
