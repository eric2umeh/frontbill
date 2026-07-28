import { mergeBookingPatch } from '@/lib/booking/edit-booking-patch'

export function derivePaymentStatusAfterReschedule(
  balance: number,
  deposit: number,
  currentPaymentStatus: string,
): string {
  const ps = String(currentPaymentStatus || '').toLowerCase()
  if (ps === 'city_ledger') return 'city_ledger'
  if (balance <= 0) return 'paid'
  if (deposit > 0) return 'partial'
  return 'pending'
}

/** Folio room_charge payment_status aligned with post-reschedule booking payment_status. */
export function folioRoomChargeStatusAfterReschedule(
  bookingPaymentStatus: string,
): 'paid' | 'unpaid' | 'city_ledger' {
  const ps = String(bookingPaymentStatus || '').toLowerCase()
  if (ps === 'city_ledger') return 'city_ledger'
  if (ps === 'paid') return 'paid'
  return 'unpaid'
}

export type FolioRoomChargeLine = {
  id: string
  amount?: unknown
  description?: string | null
}

/**
 * Keep the primary stay room_charge in sync with the rescheduled total.
 * Extra room_charge/reservation lines are zeroed so night-count changes cannot leave
 * stale accommodation amounts on the folio (which drives checkout / bill balance).
 */
export function buildRescheduleRoomChargeFolioUpdates(
  roomChargeLines: FolioRoomChargeLine[],
  fields: { total_amount: number; number_of_nights: number; payment_status: string },
): { id: string; amount: number; description: string; payment_status: string }[] {
  if (!roomChargeLines.length) return []
  const nights = fields.number_of_nights
  const payment_status = folioRoomChargeStatusAfterReschedule(fields.payment_status)
  const description = `Initial booking charge - ${nights} night${nights !== 1 ? 's' : ''}`
  return roomChargeLines.map((line, index) => ({
    id: line.id,
    amount: index === 0 ? fields.total_amount : 0,
    description: index === 0 ? description : String(line.description || 'Superseded room charge'),
    payment_status: index === 0 ? payment_status : 'unpaid',
  }))
}

export function buildRescheduleStayFields(
  current: Record<string, unknown>,
  check_in: string,
  check_out: string,
): {
  check_in: string
  check_out: string
  number_of_nights: number
  total_amount: number
  balance: number
  payment_status: string
} {
  const merged = mergeBookingPatch(current, { check_in, check_out })
  const rate = Number(current.rate_per_night ?? 0)
  const deposit = Number(current.deposit ?? 0)
  const total_amount = rate * merged.number_of_nights
  const balance = Math.max(0, total_amount - deposit)
  const payment_status = derivePaymentStatusAfterReschedule(
    balance,
    deposit,
    String(current.payment_status ?? 'pending'),
  )
  return {
    check_in: merged.check_in,
    check_out: merged.check_out,
    number_of_nights: merged.number_of_nights,
    total_amount,
    balance,
    payment_status,
  }
}

export function appendRescheduleStayNote(
  existingNotes: string | null | undefined,
  prev: { check_in: string; check_out: string },
  next: { check_in: string; check_out: string },
  reason?: string | null,
): string {
  const prevCi = prev.check_in.slice(0, 10)
  const prevCo = prev.check_out.slice(0, 10)
  const nextCi = next.check_in.slice(0, 10)
  const nextCo = next.check_out.slice(0, 10)
  const line = `Stay rescheduled ${prevCi}–${prevCo} → ${nextCi}–${nextCo}${
    reason?.trim() ? `: ${reason.trim()}` : ''
  }`
  const base = (existingNotes || '').trim()
  return base ? `${base}\n${line}` : line
}
