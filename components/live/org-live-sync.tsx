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

const FALLBACK_POLL_MS = 3_000
const DEBOUNCE_MS = 200

/**
 * Keeps all signed-in staff in sync: supply/bar stock, outlet menus, bookings.
 * Uses Supabase Realtime when enabled; always polls as a fallback.
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
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') pulseAll()
    }, FALLBACK_POLL_MS)

    const supabase = createClient()
    if (!supabase) {
      pulseAll()
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        window.clearInterval(poll)
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
      .subscribe()

    pulseAll()

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(poll)
      debouncers.forEach((t) => clearTimeout(t))
      debouncers.clear()
      void supabase.removeChannel(channel)
    }
  }, [organizationId])

  return null
}
