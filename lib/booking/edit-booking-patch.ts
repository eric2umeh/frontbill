import { differenceInCalendarDays, parseISO } from 'date-fns'
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

export function calendarNightsBetween(checkInYmd: string, checkOutYmd: string): number {
  const a = parseISO(checkInYmd)
  const b = parseISO(checkOutYmd)
  const d = differenceInCalendarDays(b, a)
  return Math.max(1, d)
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
