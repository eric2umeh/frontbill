'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import {
  ORG_LIVE_BOOKINGS,
  ORG_LIVE_CATALOG,
  ORG_LIVE_OUTLET_MENU,
  ORG_LIVE_SUPPLY,
  dispatchOrgLiveEvent,
} from '@/lib/live/org-live-events'
import { SUPPLY_LIVE_SYNC_ENABLED } from '@/lib/supply-chain/supply-egress'

/** When Realtime is down — slow catch-up only (was 180s). */
const OFFLINE_FALLBACK_POLL_MS = 300_000
/** When Realtime is up — rare safety net only (was 600s). */
const ONLINE_SAFETY_POLL_MS = 900_000
const DEBOUNCE_MS = 400
/** Ignore rapid tab focus pulses so visibilitychange does not refetch every switch. */
const VISIBILITY_PULSE_COOLDOWN_MS = 120_000

function pathWantsBookingsLive(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname.startsWith('/bookings') ||
    pathname.startsWith('/reservations') ||
    pathname.startsWith('/bulk-bookings') ||
    pathname.startsWith('/daily-book') ||
    pathname.startsWith('/rooms') ||
    pathname.startsWith('/housekeeping') ||
    pathname.startsWith('/front-office')
  )
}

function pathWantsOutletMenuLive(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname.startsWith('/outlets') ||
    pathname.startsWith('/pos') ||
    pathname.startsWith('/supply') ||
    pathname.startsWith('/kitchen')
  )
}

/**
 * Keeps signed-in staff in sync: outlet menus, bookings, and optionally supply stock.
 * Supply Realtime/poll is off by default — set NEXT_PUBLIC_SUPPLY_LIVE_SYNC=true to enable.
 * Safety polls are slow and path-gated so idle tabs on non-FO routes do not refetch lists.
 */
export function OrgLiveSync() {
  const { organizationId } = useAuth()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const debouncersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const lastVisibilityPulseAtRef = useRef(0)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!organizationId) return

    const debouncers = debouncersRef.current
    const supplyLive = SUPPLY_LIVE_SYNC_ENABLED

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

    /** Timed / visibility catch-up — only pulse channels the current route cares about. */
    const pulseSafety = () => {
      const path = pathnameRef.current
      if (supplyLive) pulse(ORG_LIVE_SUPPLY)
      if (pathWantsOutletMenuLive(path)) pulse(ORG_LIVE_OUTLET_MENU)
      if (pathWantsBookingsLive(path)) pulse(ORG_LIVE_BOOKINGS)
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastVisibilityPulseAtRef.current < VISIBILITY_PULSE_COOLDOWN_MS) return
      lastVisibilityPulseAtRef.current = now
      pulseSafety()
    }

    document.addEventListener('visibilitychange', onVisible)

    let pollHandle = 0
    const reschedulePoll = (ms: number) => {
      window.clearInterval(pollHandle)
      pollHandle = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        pulseSafety()
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

    let channel = supabase.channel(`org-live:${organizationId}`)

    if (supplyLive) {
      channel = channel
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
    }

    channel = channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outlet_menu_items',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (pathWantsOutletMenuLive(pathnameRef.current)) pulse(ORG_LIVE_OUTLET_MENU)
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outlet_menu_categories',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (pathWantsOutletMenuLive(pathnameRef.current)) pulse(ORG_LIVE_OUTLET_MENU)
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (pathWantsBookingsLive(pathnameRef.current)) pulse(ORG_LIVE_BOOKINGS)
        },
      )
      .subscribe((status) => {
        reschedulePoll(
          status === 'SUBSCRIBED' ? ONLINE_SAFETY_POLL_MS : OFFLINE_FALLBACK_POLL_MS,
        )
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
