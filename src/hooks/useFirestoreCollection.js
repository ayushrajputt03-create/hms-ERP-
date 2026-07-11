import { useState, useEffect } from 'react'
import { subscribeToCollection } from '@lib/db'

export function useRealtimeList(path) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!path) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const unsubscribe = subscribeToCollection(path, (docs) => {
        setData(docs)
        setLoading(false)
      })
      return unsubscribe
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }, [path])

  return { data, loading, error }
}

export { useRealtimeList as useFirestoreCollection }
