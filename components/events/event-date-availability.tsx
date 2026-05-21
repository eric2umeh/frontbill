'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import {
  effectiveEventEndDate,
  eventAvailabilityStatusLabel,
  filterOverlappingActiveEvents,
} from '@/lib/events/event-date-overlap'
import type { HotelEventRow } from '@/lib/events/types'
import { Badge } from '@/components/ui/badge'
import { CalendarDays } from 'lucide-react'

type Props = {
  events: HotelEventRow[]
  startDate: string
  endDate: string
  excludeEventId?: string | null
}

function formatEventPeriod(ev: HotelEventRow): string {
  try {
    const start = format(parseISO(String(ev.start_date).slice(0, 10)), 'd MMM yyyy')
    const end = format(parseISO(String(ev.end_date).slice(0, 10)), 'd MMM yyyy')
    return ev.start_date === ev.end_date ? start : `${start} – ${end}`
  } catch {
    return `${ev.start_date} – ${ev.end_date}`
  }
}

export function EventDateAvailability({ events, startDate, endDate, excludeEventId }: Props) {
  const effectiveEnd = effectiveEventEndDate(startDate, endDate)

  const overlapping = useMemo(
    () =>
      filterOverlappingActiveEvents(
        events,
        startDate,
        endDate || startDate,
        excludeEventId,
      ),
    [events, startDate, endDate, excludeEventId],
  )

  if (!startDate) return null

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        <span>Date availability</span>
      </div>
      {overlapping.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No booked/reserved events for{' '}
          {(() => {
            try {
              return effectiveEnd === startDate
                ? format(parseISO(startDate), 'd MMM yyyy')
                : `${format(parseISO(startDate), 'd MMM yyyy')} – ${format(parseISO(effectiveEnd), 'd MMM yyyy')}`
            } catch {
              return `${startDate}${effectiveEnd !== startDate ? ` – ${effectiveEnd}` : ''}`
            }
          })()}
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {overlapping.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{ev.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {[ev.venue, formatEventPeriod(ev)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {eventAvailabilityStatusLabel(ev.status)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
