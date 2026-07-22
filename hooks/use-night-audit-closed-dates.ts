'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ClosedDatesStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useNightAuditClosedDates(userId: string | null | undefined, enabled = true) {
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<ClosedDatesStatus>('idle')

  const refresh = useCallback(async () => {
    if (!enabled || !userId || userId === 'placeholder') {
      setClosedDates(new Set())
      setStatus('idle')
      return null
    }
    setStatus('loading')
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
        setStatus('error')
        return null
      }
      const dates = new Set<string>(
        Array.isArray(json.dates)
          ? json.dates.filter((date: unknown): date is string => (
              typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
            ))
          : [],
      )
      setClosedDates(dates)
      setStatus('ready')
      return dates
    } catch {
      setStatus('error')
      return null
    }
  }, [enabled, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    closedDates,
    loading: status === 'loading',
    ready: status === 'ready',
    error: status === 'error',
    refresh,
  }
}
