'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { BackdatePendingCountContext } from '@/hooks/use-backdate-pending-count'
import { quietBrowserFetch } from '@/lib/utils/fetch-retry'

/** Single poll for sidebar + Night Audit badges (avoids duplicate hooks calling the same API). */
const PENDING_COUNT_POLL_MS = 600_000
const PENDING_VISIBILITY_COOLDOWN_MS = 120_000

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
    let lastLoadAt = 0

    const load = async (force = false) => {
      const now = Date.now()
      if (!force && lastLoadAt > 0 && now - lastLoadAt < PENDING_VISIBILITY_COOLDOWN_MS) {
        return
      }
      lastLoadAt = now
      try {
        const res = await quietBrowserFetch(
          `/api/backdate-requests/pending-count?caller_id=${encodeURIComponent(userId)}`,
          { credentials: 'include' },
        )
        if (!res) return
        const json = await res.json().catch(() => ({}))
        if (!cancelled && typeof json.count === 'number') setCount(json.count)
      } catch {
        if (!cancelled) setCount(0)
      }
    }

    void load(true)

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void load(true)
    }, PENDING_COUNT_POLL_MS)

    const onVis = () => {
      if (document.visibilityState === 'visible') void load(false)
    }
    document.addEventListener('visibilitychange', onVis)

    const onCustom = () => void load(true)
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
