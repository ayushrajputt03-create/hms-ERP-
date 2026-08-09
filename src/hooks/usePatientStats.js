import { useState, useEffect, useCallback } from 'react'
import { useFacility } from './useFacility'
import { getPatientStats } from '@lib/patients'

// Shared by the dashboard cards and the OPD footfall widget.
//
// Takes no range argument on purpose. The RPC returns every bucket in one
// round trip, so a `usePatientStats(range)` signature would either refetch on
// each toggle for data it already had, or quietly ignore its own argument.
// Callers pick the range they want out of the returned object instead — the
// OPD toggle is then instant and costs nothing.
//
// `error` is surfaced rather than swallowed: a failed count and a genuine zero
// look identical once rendered, so the caller needs to be able to tell them
// apart and show "—".
export function usePatientStats() {
  const { facilityId } = useFacility()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  // Counts are a snapshot, not a subscription — the point of the RPC is to
  // avoid holding the register open in the browser. refresh() lets a screen
  // that has just written a visit pull a fresh number without a page reload.
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!facilityId) return undefined
    let live = true
    setLoading(true)
    getPatientStats()
      .then((data) => {
        if (!live) return
        setStats(data)
        setError(null)
      })
      .catch((err) => {
        if (!live) return
        console.error('Patient stats error:', err)
        setStats(null)
        setError(err)
      })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [facilityId, nonce])

  return { stats, loading, error, refresh }
}

export const STAT_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
]

// Renders a count for display. Distinguishes three states that a bare number
// cannot: still loading, failed, and a real zero.
export function formatCount(value, { loading = false } = {}) {
  if (loading) return '…'
  if (value == null) return '—'
  return Number(value).toLocaleString('en-IN')
}
