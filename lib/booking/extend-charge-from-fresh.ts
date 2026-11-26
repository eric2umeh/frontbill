import { extensionAdditionalNights, toYmd } from '@/lib/booking/edit-booking-patch'

export type ExtendChargeFromFresh = {
  /** Checkout on the row is already at or past the requested date — do not charge again. */
  alreadyExtended: boolean
  nights: number
  rate: number
  amount: number
  checkInYmd: string
  currentCheckOutYmd: string
}

/**
 * Nights and amount for one folio, using the checkout currently stored on the booking.
 * A bulk extend saves each room as it goes. If a later room fails, Confirm stays open
 * and still holds the original checkout dates — retry must bill only the remainder.
 */
export function extendChargeFromFreshBooking(input: {
  freshCheckIn?: string | null
  freshCheckOut?: string | null
  freshRate?: number | string | null
  fallbackCheckIn?: string | null
  fallbackCheckOut?: string | null
  fallbackRate?: number | string | null
  newCheckOutYmd: string
}): ExtendChargeFromFresh {
  const checkInYmd = toYmd(input.freshCheckIn) || toYmd(input.fallbackCheckIn)
  const currentCheckOutYmd =
    toYmd(input.freshCheckOut) || toYmd(input.fallbackCheckOut)
  const hasFreshRate = input.freshRate != null && input.freshRate !== ''
  const parsedFresh = Number(input.freshRate)
  const rate = Math.max(
    0,
    hasFreshRate && Number.isFinite(parsedFresh)
      ? parsedFresh
      : Number(input.fallbackRate) || 0,
  )
  const nights = extensionAdditionalNights({
    checkInYmd,
    currentCheckOutYmd,
    newCheckOutYmd: input.newCheckOutYmd,
  })
  return {
    alreadyExtended: nights <= 0,
    nights,
    rate,
    amount: Math.max(0, nights) * rate,
    checkInYmd,
    currentCheckOutYmd,
  }
}
