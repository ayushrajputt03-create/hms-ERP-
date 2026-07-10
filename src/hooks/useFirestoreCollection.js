import { useState, useEffect, useRef } from 'react'
import { subscribeToCollection } from '@lib/db'

export function useFirestoreCollection(collectionPath, constraints = []) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const constraintsKey = useRef(JSON.stringify(constraints))

  useEffect(() => {
    constraintsKey.current = JSON.stringify(constraints)
  }, [constraints])

  useEffect(() => {
    if (!collectionPath) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const unsubscribe = subscribeToCollection(collectionPath, (docs) => {
        setData(docs)
        setLoading(false)
      }, constraints)
      return unsubscribe
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }, [collectionPath, constraintsKey.current])

  return { data, loading, error }
}
