import { z } from 'zod'

export const editBookingPatchSchema = z
  .object({
    check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    room_id: z.string().uuid().optional(),
    rate_per_night: z.coerce.number().min(0).optional(),
    total_amount: z.coerce.number().min(0).optional(),
    deposit: z.coerce.number().min(0).optional(),
    balance: z.coerce.number().optional(),
    payment_status: z.string().min(1).max(64).optional(),
    payment_method: z.string().max(64).optional().nullable(),
    ledger_account_name: z.string().max(500).optional().nullable(),
    status: z.string().min(1).max(64).optional(),
    folio_status: z.string().min(1).max(64).optional(),
    notes: z.string().max(5000).optional().nullable(),
  })
  .strict()

export type EditBookingPatch = z.infer<typeof editBookingPatchSchema>

/** Normalize DB / ISO timestamps to `YYYY-MM-DD` (calendar date only). */
export function toYmd(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(value).trim()
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? m[1] : ''
}

/**
 * Calendar nights between two YMD dates (checkout exclusive).
 * Uses UTC calendar arithmetic so `new Date('YYYY-MM-DD')` timezone shifts cannot
 * turn a 2-night extension into 3 nights (or vice versa).
 */
export function calendarDaysBetween(fromYmd: string, toYmdDate: string): number {
  const a = toYmd(fromYmd)
  const b = toYmd(toYmdDate)
  if (!a || !b) return 0
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const start = Date.UTC(ay, am - 1, ad)
  const end = Date.UTC(by, bm - 1, bd)
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

/** Full stay length for a booking — at least 1 night when dates are valid. */
export function calendarNightsBetween(checkInYmd: string, checkOutYmd: string): number {
  return Math.max(1, calendarDaysBetween(checkInYmd, checkOutYmd))
}

/** Add (or subtract) whole calendar days to a YYYY-MM-DD date using UTC arithmetic. */
export function addCalendarDaysYmd(ymd: string, days: number): string {
  const a = toYmd(ymd)
  if (!a) return ''
  const [y, m, d] = a.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * When a reserved guest is checked in on a different calendar day, keep the
 * original number of nights and start the stay on the actual arrival date.
 */
export function stayDatesFromActualArrival(input: {
  originalCheckIn: string
  originalCheckOut: string
  actualArrivalYmd: string
  numberOfNights?: number | null
}): { check_in: string; check_out: string; number_of_nights: number } {
  const nightsFromField = Number(input.numberOfNights)
  const nights =
    Number.isFinite(nightsFromField) && nightsFromField > 0
      ? Math.floor(nightsFromField)
      : calendarNightsBetween(input.originalCheckIn, input.originalCheckOut)
  const arrival = toYmd(input.actualArrivalYmd) || toYmd(input.originalCheckIn)
  return {
    check_in: arrival,
    check_out: addCalendarDaysYmd(arrival, nights),
    number_of_nights: nights,
  }
}

/** Hotel-night overlap: existing.check_in < other.check_out AND existing.check_out > other.check_in. */
export function bookingsDateRangesOverlap(
  aIn: string,
  aOut: string,
  bIn: string,
  bOut: string,
): boolean {
  const aI = toYmd(aIn)
  const aO = toYmd(aOut)
  const bI = toYmd(bIn)
  const bO = toYmd(bOut)
  if (!aI || !aO || !bI || !bO) return false
  return aI < bO && aO > bI
}

export type OccupyingStayRow = {
  id?: string | null
  room_id?: string | null
  check_in: string
  check_out: string
  status?: string | null
}

function isPhysicalOccupyingStatus(status: string | null | undefined): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return st === 'checked_in' || st === 'confirmed'
}

/** True when an in-house/confirmed folio already holds `targetRoomId` for the stay dates. */
export function occupyingStayBlocksRoom(
  occupying: OccupyingStayRow,
  targetRoomId: string,
  stayCheckIn: string,
  stayCheckOut: string,
  excludeBookingId?: string | null,
): boolean {
  if (!targetRoomId || occupying.room_id !== targetRoomId) return false
  if (excludeBookingId && occupying.id && occupying.id === excludeBookingId) return false
  if (occupying.status != null && occupying.status !== '' && !isPhysicalOccupyingStatus(occupying.status)) {
    return false
  }
  return bookingsDateRangesOverlap(
    occupying.check_in,
    occupying.check_out,
    stayCheckIn,
    stayCheckOut,
  )
}

/** Rooms that already have a confirmed or checked-in folio overlapping the stay. */
export function roomIdsBlockedForStay(
  occupying: OccupyingStayRow[],
  stayCheckIn: string,
  stayCheckOut: string,
  excludeBookingId?: string | null,
): Set<string> {
  const blocked = new Set<string>()
  for (const row of occupying) {
    const roomId = String(row.room_id || '')
    if (!roomId) continue
    if (occupyingStayBlocksRoom(row, roomId, stayCheckIn, stayCheckOut, excludeBookingId)) {
      blocked.add(roomId)
    }
  }
  return blocked
}

/**
 * Extra nights when moving checkout later.
 * Prefer (nights after − nights before) using check-in so a stale/mis-parsed
 * current checkout cannot charge the whole stay again as an “extension”.
 */
export function extensionAdditionalNights(input: {
  checkInYmd?: string | null
  currentCheckOutYmd: string
  newCheckOutYmd: string
}): number {
  const checkIn = toYmd(input.checkInYmd)
  const currentOut = toYmd(input.currentCheckOutYmd)
  const newOut = toYmd(input.newCheckOutYmd)
  if (!newOut || !currentOut) return 0
  if (newOut <= currentOut) return 0

  if (checkIn && checkIn < currentOut) {
    const before = calendarDaysBetween(checkIn, currentOut)
    const after = calendarDaysBetween(checkIn, newOut)
    return Math.max(0, after - before)
  }

  return calendarDaysBetween(currentOut, newOut)
}

/** Apply validated patch onto existing row values and return DB-ready fields (subset). */
export function mergeBookingPatch(
  current: Record<string, unknown>,
  patch: EditBookingPatch,
): {
  check_in: string
  check_out: string
  number_of_nights: number
  room_id: string
  rate_per_night: number
  total_amount: number
  deposit: number
  balance: number
  payment_status: string
  payment_method: string | null
  ledger_account_name: string | null
  status: string
  folio_status: string
  notes: string | null
} {
  const check_in = (patch.check_in ?? current.check_in) as string
  const check_out = (patch.check_out ?? current.check_out) as string
  if (check_in >= check_out) {
    throw new Error('Check-out must be after check-in')
  }

  const number_of_nights = calendarNightsBetween(check_in, check_out)
  const room_id = (patch.room_id ?? current.room_id) as string
  const rate_per_night = patch.rate_per_night ?? Number(current.rate_per_night ?? 0)
  const total_amount = patch.total_amount ?? Number(current.total_amount ?? 0)
  const deposit = patch.deposit ?? Number(current.deposit ?? 0)
  const balance = patch.balance ?? Number(current.balance ?? 0)
  const payment_status = patch.payment_status ?? String(current.payment_status ?? 'pending')
  const payment_method =
    patch.payment_method !== undefined ? patch.payment_method : ((current.payment_method as string) ?? 'cash')
  const ledger_account_name =
    patch.ledger_account_name !== undefined
      ? patch.ledger_account_name
      : ((current.ledger_account_name as string) ?? null)
  const status = patch.status ?? String(current.status ?? 'active')
  const folio_status = patch.folio_status ?? String(current.folio_status ?? 'active')
  const notes = patch.notes !== undefined ? patch.notes : ((current.notes as string) ?? null)

  return {
    check_in,
    check_out,
    number_of_nights,
    room_id,
    rate_per_night,
    total_amount,
    deposit,
    balance,
    payment_status,
    payment_method,
    ledger_account_name,
    status,
    folio_status,
    notes,
  }
}

export function roomHousekeepingAfterEdit(bookingStatus: string): 'occupied' | 'reserved' | 'available' {
  const s = String(bookingStatus || '').toLowerCase()
  if (s === 'cancelled') return 'available'
  if (s === 'reserved') return 'reserved'
  return 'occupied'
}
