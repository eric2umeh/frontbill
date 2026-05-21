'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { CalendarClock, PartyPopper } from 'lucide-react'
import {
  ReservationsEventsHeaderProvider,
  useReservationsEventsHeader,
} from '@/components/reservations/reservations-events-header'

function ReservationsEventsLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { role } = useAuth()
  const { headerActions } = useReservationsEventsHeader()
  const showEvents = hasPermission(role, 'events:view')

  const reservationsActive =
    pathname === '/reservations' ||
    (pathname.startsWith('/reservations/') && !pathname.startsWith('/reservations/events'))
  const eventsActive = pathname.startsWith('/reservations/events')

  const pageTitle = eventsActive ? 'Events' : 'Reservations'

  const tabClass = (active: boolean) =>
    cn(
      'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px',
      active
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{pageTitle}</h1>
        {headerActions ? (
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">{headerActions}</div>
        ) : null}
      </div>
      <nav className="flex flex-wrap gap-0 border-b">
        <Link href="/reservations" className={tabClass(reservationsActive)}>
          <CalendarClock className="h-4 w-4" />
          Reservations
        </Link>
        {showEvents && (
          <Link href="/reservations/events" className={tabClass(eventsActive)}>
            <PartyPopper className="h-4 w-4" />
            Events
          </Link>
        )}
      </nav>
      {children}
    </div>
  )
}

export default function ReservationsEventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReservationsEventsHeaderProvider>
      <ReservationsEventsLayoutInner>{children}</ReservationsEventsLayoutInner>
    </ReservationsEventsHeaderProvider>
  )
}
