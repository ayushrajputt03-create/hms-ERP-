import { useState, useEffect } from 'react'
import { subscribeToDocument } from '@lib/db'

export function useFirestoreDoc(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!path) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const unsubscribe = subscribeToDocument(path, (doc) => {
        setData(doc)
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
