'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import {
  EMPTY_NIGHT_AUDIT_PENDING_COUNTS,
  type NightAuditPendingCounts,
} from '@/lib/night-audit/pending-approval-counts'
import { NightAuditPendingCountContext } from '@/hooks/use-night-audit-pending-counts'

const PENDING_COUNT_POLL_MS = 180_000

function canPollNightAuditPending(role: string | null | undefined): boolean {
  return (
    hasPermission(role, 'backdate:approve') ||
    hasPermission(role, 'room_change:approve') ||
    hasPermission(role, 'reschedule_stay:approve')
  )
}

export function NightAuditPendingProvider({ children }: { children: React.ReactNode }) {
  const { userId, role } = useAuth()
  const enabled = canPollNightAuditPending(role) && !!userId && userId !== 'placeholder'
  const [counts, setCounts] = useState<NightAuditPendingCounts>(EMPTY_NIGHT_AUDIT_PENDING_COUNTS)

  useEffect(() => {
    if (!enabled) {
      setCounts(EMPTY_NIGHT_AUDIT_PENDING_COUNTS)
      return
    }

    let cancelled = false

    const load = async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const res = await fetch(
          `/api/night-audit/pending-counts?caller_id=${encodeURIComponent(userId)}`,
          { credentials: 'include', signal: controller.signal },
        )
        const json = await res.json().catch(() => ({}))
        if (!cancelled && json.counts && typeof json.counts.total === 'number') {
          setCounts(json.counts as NightAuditPendingCounts)
        }
      } catch {
        if (!cancelled) setCounts(EMPTY_NIGHT_AUDIT_PENDING_COUNTS)
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
    window.addEventListener('frontbill-night-audit-pending-changed', onCustom)
    window.addEventListener('frontbill-backdate-pending-changed', onCustom)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('frontbill-night-audit-pending-changed', onCustom)
      window.removeEventListener('frontbill-backdate-pending-changed', onCustom)
    }
  }, [enabled, userId])

  return (
    <NightAuditPendingCountContext.Provider value={counts}>
      {children}
    </NightAuditPendingCountContext.Provider>
  )
}
