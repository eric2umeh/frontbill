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

/** Shift a YMD calendar date by a signed day count (UTC date arithmetic). */
export function addCalendarDaysYmd(ymd: string, days: number): string {
  const d = toYmd(ymd)
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  const ny = utc.getUTCFullYear()
  const nm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(utc.getUTCDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

/**
 * Reject discounted-extension approval when the stay moved after the request
 * was filed (standard Extend Stay, another approval, or shortened dates).
 * Approving blindly would post a second folio charge and can overwrite
 * checkout backward (losing later nights).
 */
export function extendDiscountStayConflict(input: {
  currentCheckOutYmd?: string | null
  requestedNewCheckOutYmd?: string | null
  additionalNights?: number | null
}): string | null {
  const requested = toYmd(input.requestedNewCheckOutYmd)
  const current = toYmd(input.currentCheckOutYmd)
  const nights = Math.max(0, Number(input.additionalNights) || 0)
  if (!requested) return 'Requested checkout date is missing'
  if (!current) return 'Booking checkout date is missing'
  if (nights <= 0) return 'Extension must add at least one night'
  const expectedBaseCheckout = addCalendarDaysYmd(requested, -nights)
  if (!expectedBaseCheckout) return 'Requested checkout date is invalid'
  if (current !== expectedBaseCheckout) {
    return 'Stay dates changed since this request was created. Reject it and submit a new discount request from the current checkout.'
  }
  return null
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
