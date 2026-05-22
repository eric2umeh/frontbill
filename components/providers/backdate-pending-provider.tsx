'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { BackdatePendingCountContext } from '@/hooks/use-backdate-pending-count'

/** Single poll for sidebar + Night Audit badges (avoids duplicate hooks calling the same API). */
const PENDING_COUNT_POLL_MS = 180_000

export function BackdatePendingProvider({ children }: { children: React.ReactNode }) {
  const { userId, role } = useAuth()
  const enabled = hasPermission(role, 'backdate:approve') && !!userId && userId !== 'placeholder'
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }

    let cancelled = false

    const load = async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const res = await fetch(
          `/api/backdate-requests/pending-count?caller_id=${encodeURIComponent(userId)}`,
          { credentials: 'include', signal: controller.signal },
        )
        const json = await res.json().catch(() => ({}))
        if (!cancelled && typeof json.count === 'number') setCount(json.count)
      } catch {
        if (!cancelled) setCount(0)
      } finally {
        clearTimeout(timer)
      }
    }

    void load()

    const interval = window.setInterval(load, PENDING_COUNT_POLL_MS)

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

  return <BackdatePendingCountContext.Provider value={count}>{children}</BackdatePendingCountContext.Provider>
}
