'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useNightAuditClosedDates(userId: string | null | undefined, enabled = true) {
  const [closedDates, setClosedDates] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!enabled || !userId || userId === 'placeholder') {
      setClosedDates(null)
      setLoading(false)
      return
    }
    // Unknown must not be represented as an empty successful result: callers use
    // null to fail closed until Night Audit state is confirmed.
    setClosedDates(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const headers: Record<string, string> = {}
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`
        }
      }
      const res = await fetch(
        `/api/night-audit/closed-dates?days=45`,
        { credentials: 'include', headers },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (requestId === requestIdRef.current) setClosedDates(null)
        return
      }
      if (requestId === requestIdRef.current) {
        setClosedDates(new Set((json.dates as string[]) || []))
      }
    } catch {
      if (requestId === requestIdRef.current) setClosedDates(null)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [enabled, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { closedDates, loading, refresh }
}
