import { useState, useEffect, useCallback } from 'react'

// Minimal data-fetching hook: runs `fn` on mount and when `deps` change.
// Returns { data, loading, error, reload, setData }.
export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    setError(null)
    run()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [run])

  useEffect(() => load(), [load])

  return { data, loading, error, reload: load, setData }
}
