'use client'

import { useEffect, useState } from 'react'

/** Polls pending backdate count for admins; refreshes on tab focus & custom browser event. */
export function useBackdatePendingCount(enabled: boolean, userId: string) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled || !userId || userId === 'placeholder') {
      setCount(0)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/backdate-requests/pending-count?caller_id=${encodeURIComponent(userId)}`, {
          credentials: 'include',
        })
        const json = await res.json().catch(() => ({}))
        if (!cancelled && typeof json.count === 'number') setCount(json.count)
      } catch {
        if (!cancelled) setCount(0)
      }
    }

    void load()

    const interval = window.setInterval(load, 120_000)

    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)

    const onCustom = () => void load()
    window.addEventListener('frontbill-backdate-pending-changed', onCustom)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('frontbill-backdate-pending-changed', onCustom)
    }
  }, [enabled, userId])

  return count
}
