'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useNightAuditClosedDates(userId: string | null | undefined, enabled = true) {
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<ReadonlySet<string> | null> => {
    if (!enabled || !userId || userId === 'placeholder') {
      setClosedDates(new Set())
      return null
    }
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
      if (
        !res.ok ||
        !Array.isArray(json.dates) ||
        json.dates.some((date: unknown) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      ) {
        return null
      }
      const nextClosedDates = new Set<string>(json.dates)
      setClosedDates(nextClosedDates)
      return nextClosedDates
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { closedDates, loading, refresh }
}
