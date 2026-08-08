/**
 * When a booking is marked no-show, the stay charge (reservation / room_charge)
 * must be superseded by the policy no-show fee — otherwise AR stacks both.
 */

export const NO_SHOW_SUPERSEDED_CHARGE_TYPES = new Set([
  'reservation',
  'room_charge',
])

export type FolioChargeForNoShow = {
  id?: string | null
  charge_type?: string | null
  amount?: unknown
  payment_status?: string | null
  description?: string | null
}

export function isNoShowSupersededStayCharge(
  charge: FolioChargeForNoShow,
): boolean {
  const ctype = String(charge.charge_type || '')
    .trim()
    .toLowerCase()
  if (!NO_SHOW_SUPERSEDED_CHARGE_TYPES.has(ctype)) return false

  const amt = Number(charge.amount ?? 0)
  if (!(amt > 0)) return false

  const status = String(charge.payment_status || '')
    .trim()
    .toLowerCase()
  if (status === 'voided' || status === 'superseded' || status === 'cancelled') {
    return false
  }

  return true
}

/** IDs of stay lines that must be voided before posting a no-show fee. */
export function stayChargeIdsToSupersedeOnNoShow(
  charges: FolioChargeForNoShow[],
): string[] {
  const ids: string[] = []
  for (const charge of charges) {
    if (!isNoShowSupersededStayCharge(charge)) continue
    const id = String(charge.id || '').trim()
    if (id) ids.push(id)
  }
  return ids
}

/**
 * Expected bill after voiding stay lines and posting `feeAmount`.
 * Existing payment lines remain and offset the fee.
 */
export function expectedNoShowOutstanding(input: {
  charges: Array<{
    amount?: unknown
    charge_type?: string | null
    payment_status?: string | null
    payment_method?: string | null
  }>
  feeAmount: number
}): number {
  const fee = Math.max(0, Number(input.feeAmount) || 0)
  let unpaid = fee
  let payments = 0

  for (const raw of input.charges) {
    if (isNoShowSupersededStayCharge(raw)) continue

    const status = String(raw.payment_status || '')
      .trim()
      .toLowerCase()
    if (
      status === 'voided' ||
      status === 'superseded' ||
      status === 'cancelled'
    ) {
      continue
    }

    const ctype = String(raw.charge_type || '')
      .trim()
      .toLowerCase()
    const amt = Number(raw.amount ?? 0)

    if (ctype === 'payment' || amt < 0) {
      if (status === 'paid' || status === 'posted_to_ledger') {
        payments += Math.abs(amt)
      }
      continue
    }

    if (amt <= 0) continue
    if (ctype === 'no_show_fee') continue

    const method = String(raw.payment_method || '')
      .trim()
      .toLowerCase()
    const unpaidStatus =
      ['pending', 'unpaid', 'city_ledger', 'partial'].includes(status) ||
      (method === 'city_ledger' && status !== 'paid') ||
      (status === '' && amt > 0)
    if (unpaidStatus) unpaid += amt
  }

  return Math.max(0, Math.round((unpaid - payments) * 100) / 100)
}
