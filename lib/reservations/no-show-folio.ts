import {
  folioGuestCreditAmount,
  folioPositiveOutstandingSum,
  type FolioLineForBalance,
} from '@/lib/utils/booking-bill-balance'

/** Room-product lines a no-show fee replaces. Extras (outlet, minibar, add-charge) stay. */
const STAY_CHARGE_TYPES = new Set(['reservation', 'room_charge', 'extended_stay'])

export type NoShowFolioSnapshotLine = {
  id?: string
  description?: string | null
  amount?: unknown
  charge_type?: string | null
  type?: string | null
  payment_status?: string | null
  paymentStatus?: string | null
  payment_method?: string | null
  paymentMethod?: string | null
}

export type NoShowBookingMoney = {
  total_amount: number
  balance: number
  payment_status: 'pending' | 'partial' | 'paid' | 'city_ledger'
}

function chargeTypeOf(line: { charge_type?: string | null; type?: string | null }): string {
  return String(line.charge_type ?? line.type ?? '').trim().toLowerCase()
}

function roundMoney(n: number): number {
  const rounded = Math.round(n * 100) / 100
  return rounded === 0 ? 0 : rounded
}

export function isStayChargeReplacedByNoShow(chargeType: unknown): boolean {
  return STAY_CHARGE_TYPES.has(String(chargeType || '').trim().toLowerCase())
}

export function voidedNoShowStayDescription(line: {
  description?: string | null
  amount?: unknown
}): string {
  const prev = String(line.description || 'Stay charge').trim() || 'Stay charge'
  if (prev.startsWith('Voided on no-show')) return prev.slice(0, 500)
  const amt = Number(line.amount)
  const amtLabel = Number.isFinite(amt) ? amt.toFixed(2) : '0.00'
  return `Voided on no-show (was ${amtLabel}) — ${prev}`.slice(0, 500)
}

export function stayChargesReplacedByNoShow<T extends NoShowFolioSnapshotLine>(lines: T[]): T[] {
  return lines.filter((line) => {
    if (!String(line.id || '').trim()) return false
    if (!isStayChargeReplacedByNoShow(chargeTypeOf(line))) return false
    return Number(line.amount) > 0
  })
}

/** Folio as it should read after the unused stay is removed and the no-show fee is the room bill. */
export function folioLinesAfterNoShowFee(
  lines: NoShowFolioSnapshotLine[],
  feeAmount: number,
): FolioLineForBalance[] {
  const adjusted: FolioLineForBalance[] = lines.map((line) => {
    const type = chargeTypeOf(line)
    if (isStayChargeReplacedByNoShow(type) && Number(line.amount) > 0) {
      return {
        amount: 0,
        charge_type: type,
        payment_status: 'void',
        payment_method: line.payment_method ?? line.paymentMethod ?? null,
      }
    }
    return {
      amount: line.amount,
      charge_type: type,
      payment_status: line.payment_status ?? line.paymentStatus ?? null,
      payment_method: line.payment_method ?? line.paymentMethod ?? null,
    }
  })

  const fee = roundMoney(Math.max(0, Number(feeAmount) || 0))
  if (fee > 0) {
    adjusted.push({
      amount: fee,
      charge_type: 'no_show_fee',
      payment_status: 'pending',
    })
  }
  return adjusted
}

export function noShowBookingTotals(
  lines: FolioLineForBalance[],
  currentPaymentStatus?: string | null,
): NoShowBookingMoney {
  const owed = folioPositiveOutstandingSum(lines)
  const credit = owed > 0 ? 0 : folioGuestCreditAmount(lines)
  const balance = roundMoney(owed > 0 ? owed : -credit)

  let payments = 0
  let total = 0
  for (const line of lines) {
    const amt = Number(line.amount ?? 0)
    const ctype = chargeTypeOf(line)
    const status = String(line.payment_status ?? line.paymentStatus ?? '').toLowerCase()
    if (ctype === 'payment' || amt < 0) {
      if (status === 'paid' || status === 'posted_to_ledger') payments += Math.abs(amt)
      continue
    }
    if (amt > 0 && status !== 'void') total += amt
  }

  let payment_status: NoShowBookingMoney['payment_status']
  if (balance <= 0) {
    payment_status = 'paid'
  } else if (String(currentPaymentStatus || '').toLowerCase() === 'city_ledger') {
    payment_status = 'city_ledger'
  } else if (payments > 0) {
    payment_status = 'partial'
  } else {
    payment_status = 'pending'
  }

  return {
    total_amount: roundMoney(total),
    balance,
    payment_status,
  }
}
