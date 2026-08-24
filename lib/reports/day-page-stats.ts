import { isOccupyingHotelNight } from '@/lib/utils/booking-in-house-dates'
import { countsOnDailyBookForNight } from '@/lib/rooms/room-occupancy'

type BookingNightRow = {
  check_in: string
  check_out: string
  status: string
  rate_per_night?: number | null
  folio_status?: string | null
}

/** Sum of room rates for guests occupying the hotel on `ymd`. */
export function sumRoomRevenueForHotelNight(
  bookings: BookingNightRow[],
  ymd: string,
): number {
  let total = 0
  for (const b of bookings) {
    const st = String(b.status || '').toLowerCase()
    const fs = String(b.folio_status || 'active').toLowerCase()
    if (st === 'cancelled' || fs === 'cancelled') continue
    if (!countsOnDailyBookForNight(b.status)) continue
    if (!isOccupyingHotelNight(b.check_in, b.check_out, ymd)) continue
    total += Number(b.rate_per_night) || 0
  }
  return total
}

/** Count guests in-house on `ymd`. */
export function countInHouseGuestsForNight(
  bookings: BookingNightRow[],
  ymd: string,
): number {
  let count = 0
  for (const b of bookings) {
    const st = String(b.status || '').toLowerCase()
    const fs = String(b.folio_status || 'active').toLowerCase()
    if (st === 'cancelled' || fs === 'cancelled') continue
    if (!countsOnDailyBookForNight(b.status)) continue
    if (isOccupyingHotelNight(b.check_in, b.check_out, ymd)) count += 1
  }
  return count
}

export function sumPaymentAmounts(rows: { amount?: unknown }[]): number {
  return rows.reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
}
