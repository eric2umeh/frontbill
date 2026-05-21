import type { HotelEventRow, HotelEventStatus } from '@/lib/events/types'

/** Statuses that block venue availability (active bookings). */
export const EVENT_AVAILABILITY_STATUSES: HotelEventStatus[] = ['planned', 'confirmed']

export function effectiveEventEndDate(startDate: string, endDate?: string | null): string {
  const start = String(startDate || '').slice(0, 10)
  const end = String(endDate || '').slice(0, 10)
  return end && end >= start ? end : start
}

/** Inclusive date-range overlap (YYYY-MM-DD). */
export function eventDateRangesOverlap(
  startA: string,
  endA: string | null | undefined,
  startB: string,
  endB: string | null | undefined,
): boolean {
  const a0 = String(startA).slice(0, 10)
  const a1 = effectiveEventEndDate(a0, endA)
  const b0 = String(startB).slice(0, 10)
  const b1 = effectiveEventEndDate(b0, endB)
  if (!a0 || !b0) return false
  return a0 <= b1 && a1 >= b0
}

export function filterOverlappingActiveEvents(
  events: HotelEventRow[],
  startDate: string,
  endDate: string | null | undefined,
  excludeEventId?: string | null,
): HotelEventRow[] {
  if (!startDate) return []
  return events.filter((ev) => {
    if (excludeEventId && ev.id === excludeEventId) return false
    if (!EVENT_AVAILABILITY_STATUSES.includes(ev.status)) return false
    return eventDateRangesOverlap(startDate, endDate, ev.start_date, ev.end_date)
  })
}

export function eventAvailabilityStatusLabel(status: HotelEventStatus): string {
  if (status === 'confirmed') return 'Booked'
  if (status === 'planned') return 'Reserved'
  return status
}
