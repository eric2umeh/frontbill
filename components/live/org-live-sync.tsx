'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import {
  ORG_LIVE_BOOKINGS,
  ORG_LIVE_CATALOG,
  ORG_LIVE_OUTLET_MENU,
  ORG_LIVE_SUPPLY,
  dispatchOrgLiveEvent,
} from '@/lib/live/org-live-events'

/** When Realtime is down — still rare; must not re-download full state every few seconds. */
const OFFLINE_FALLBACK_POLL_MS = 45_000
/** When Realtime is up — rare catch-up only (missed events). */
const ONLINE_SAFETY_POLL_MS = 90_000
const DEBOUNCE_MS = 400

/**
 * Keeps all signed-in staff in sync: supply/bar stock, outlet menus, bookings.
 * Uses Supabase Realtime for change signals; polls only as a slow fallback.
 * Never pulses on a fast timer — that forced full API refetches and burned egress.
 */
export function OrgLiveSync() {
  const { organizationId } = useAuth()
  const debouncersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    if (!organizationId) return

    const debouncers = debouncersRef.current

    const pulse = (eventName: string) => {
      const pending = debouncers.get(eventName)
      if (pending) clearTimeout(pending)
      debouncers.set(
        eventName,
        window.setTimeout(() => {
          debouncers.delete(eventName)
          dispatchOrgLiveEvent(eventName)
        }, DEBOUNCE_MS),
      )
    }

    const pulseAll = () => {
      pulse(ORG_LIVE_SUPPLY)
      pulse(ORG_LIVE_OUTLET_MENU)
      pulse(ORG_LIVE_BOOKINGS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') pulseAll()
    }

    document.addEventListener('visibilitychange', onVisible)

    let pollHandle = 0
    const reschedulePoll = (ms: number) => {
      window.clearInterval(pollHandle)
      pollHandle = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        pulseAll()
      }, ms)
    }

    // Start conservative until Realtime reports SUBSCRIBED.
    reschedulePoll(OFFLINE_FALLBACK_POLL_MS)

    const supabase = createClient()
    if (!supabase) {
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        window.clearInterval(pollHandle)
        debouncers.forEach((t) => clearTimeout(t))
        debouncers.clear()
      }
    }

    const channel = supabase
      .channel(`org-live:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supply_chain_snapshots',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => pulse(ORG_LIVE_SUPPLY),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supply_catalog_items',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          pulse(ORG_LIVE_CATALOG)
          pulse(ORG_LIVE_SUPPLY)
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outlet_menu_items',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => pulse(ORG_LIVE_OUTLET_MENU),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outlet_menu_categories',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => pulse(ORG_LIVE_OUTLET_MENU),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => pulse(ORG_LIVE_BOOKINGS),
      )
      .subscribe((status) => {
        reschedulePoll(status === 'SUBSCRIBED' ? ONLINE_SAFETY_POLL_MS : OFFLINE_FALLBACK_POLL_MS)
      })

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(pollHandle)
      debouncers.forEach((t) => clearTimeout(t))
      debouncers.clear()
      void supabase.removeChannel(channel)
    }
  }, [organizationId])

  return null
}
