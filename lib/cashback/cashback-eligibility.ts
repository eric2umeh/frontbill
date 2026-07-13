/**
 * Cashback (discount + earn) applies only to individual guest stays —
 * not organization / corporate city-ledger or bulk-organization blocks.
 */

export type CashbackEligibilityInput = {
  paymentMethod?: string | null
  /** When paying via city ledger: individual vs organization account tab/type. */
  ledgerAccountType?: 'individual' | 'organization' | string | null
  /** Bulk booking Step 1 type. */
  bulkBookingType?: 'individual' | 'organization' | null
  /** Guest display name — org bulk blocks use "Bulk group — …". */
  guestName?: string | null
}

function norm(s: string | null | undefined): string {
  return String(s || '').trim().toLowerCase()
}

/** True when guest name is a synthetic org bulk placeholder, not a real individual. */
export function isOrganizationBulkGuestName(guestName?: string | null): boolean {
  return /^bulk group\s*[—–-]/i.test(String(guestName || '').trim())
}

/** Whether cashback discount / earn may apply in booking & reservation flows. */
export function isGuestBookingCashbackEligible(
  input: CashbackEligibilityInput,
): boolean {
  if (input.bulkBookingType === 'organization') return false
  if (isOrganizationBulkGuestName(input.guestName)) return false

  const pm = norm(input.paymentMethod)
  if (pm === 'city_ledger') return false

  const ledgerType = norm(input.ledgerAccountType)
  if (ledgerType === 'organization') return false

  return true
}

/** Parse `payment_method:` from booking/reservation notes. */
export function paymentMethodFromBookingNotes(
  notes?: string | null,
): string | null {
  if (!notes) return null
  const m = notes.match(/payment_method:\s*([^\s|]+)/i)
  return m?.[1]?.trim() || null
}
