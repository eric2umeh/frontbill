/**
 * Hotel daily book: in-house guest list (room revenue) + cash sales collection
 * categories used for owner/director reports.
 */

import {
  collectOutletPaidTransactionOrderNumbers,
  shouldHideOutletPaymentDuplicate,
} from '@/lib/outlets/outlet-financial-integration'
import { filterDuplicatePaymentRows } from '@/lib/payments/dedupe-ledger-rows'
import { resolvePaymentAccountLabel } from '@/lib/payments/payment-accounts'
import { isOccupyingHotelNight } from '@/lib/utils/booking-in-house-dates'

export type SalesCollectionCategory =
  | 'pos'
  | 'cash'
  | 'transfer'
  | 'advance_payment'
  | 'additional_payment'
  | 'extra_charges'
  | 'debt_recovery'
  | 'city_ledger'
  | 'other'

export type DailyGuestRow = {
  booking_id: string
  guest_name: string
  room_number: string
  room_type: string
  rate_per_night: number
  check_in: string
  check_out: string
  folio_id: string
  payment_status: string
  status: string
}

export type DailyCollectionLine = {
  id: string
  guest_name: string
  room: string
  amount: number
  payment_method: string
  category: SalesCollectionCategory
  reference: string
  description: string
  payment_account_label: string
  at: string
  counts_as_cash_collection: boolean
}

export type DailyFrontDeskPack = {
  date: string
  guests: DailyGuestRow[]
  roomRevenueGenerated: number
  guestCount: number
  salesCollection: {
    total: number
    pos: number
    cash: number
    transfer: number
    advancePayment: number
    additionalPayment: number
    extraCharges: number
    debtRecovery: number
    other: number
    cityLedgerPosted: number
  }
  lines: DailyCollectionLine[]
}

function normMethod(method: string | null | undefined): string {
  return String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

function isCashLikeMethod(method: string): boolean {
  return ['cash', 'pos', 'transfer', 'bank_transfer'].includes(method)
}

export function classifySalesCollectionCategory(input: {
  reference?: string | null
  description?: string | null
  payment_method?: string | null
  status?: string | null
}): SalesCollectionCategory {
  const method = normMethod(input.payment_method)
  const ref = String(input.reference || '').trim().toUpperCase()
  const desc = String(input.description || '').toLowerCase()

  if (method === 'city_ledger') return 'city_ledger'

  if (ref.startsWith('EXT-') || desc.includes('extended stay') || desc.includes('extend stay')) {
    return 'additional_payment'
  }
  if (
    desc.includes('reservation payment') ||
    desc.includes('reservation —') ||
    desc.includes('reservation -') ||
    desc.includes('advance payment') ||
    ref.startsWith('RSV')
  ) {
    return 'advance_payment'
  }
  if (
    ref.startsWith('OUT-') ||
    ref.startsWith('CHG-') ||
    desc.includes('outlet') ||
    desc.includes('late checkout') ||
    desc.includes('additional charge') ||
    desc.includes('extra charge')
  ) {
    return 'extra_charges'
  }
  if (
    ref.startsWith('CLG-') ||
    desc.includes('debt recovery') ||
    desc.includes('settle') ||
    (ref.startsWith('PAY-') &&
      (desc.includes('payment received') || desc.includes('folio payment')))
  ) {
    return 'debt_recovery'
  }

  if (method === 'pos') return 'pos'
  if (method === 'cash') return 'cash'
  if (method === 'transfer' || method === 'bank_transfer') return 'transfer'
  return 'other'
}

function countsAsCashCollection(
  category: SalesCollectionCategory,
  method: string,
  status?: string | null,
): boolean {
  if (category === 'city_ledger') return false
  if (!isCashLikeMethod(method)) return false
  const st = String(status || '').toLowerCase().trim()
  // Only drop clearly voided rows. Many paid dual-writes use status "pending"/"completed".
  if (['void', 'cancelled', 'failed', 'refunded'].includes(st)) return false
  return true
}

export function buildDailyFrontDeskPack(input: {
  dateYmd: string
  bookings: Array<{
    id: string
    check_in: string
    check_out: string
    status?: string | null
    rate_per_night?: unknown
    folio_id?: string | null
    payment_status?: string | null
    guests?: { name?: string | null } | null
    rooms?: { room_number?: string | null; room_type?: string | null } | null
    guest_name?: string | null
  }>
  transactions: Array<{
    id: string
    amount?: unknown
    payment_method?: string | null
    status?: string | null
    booking_id?: string | null
    created_at?: string | null
    transaction_id?: string | null
    guest_name?: string | null
    description?: string | null
    room?: string | null
    payment_account_label?: string | null
  }>
  payments: Array<{
    id: string
    amount?: unknown
    payment_method?: string | null
    booking_id?: string | null
    payment_date?: string | null
    reference_number?: string | null
    notes?: string | null
    guest_id?: string | null
    payment_account_label?: string | null
  }>
  guestNameById?: Record<string, string>
}): DailyFrontDeskPack {
  const date = input.dateYmd
  const occupyingStatuses = new Set(['checked_in', 'confirmed', 'checked_out', 'reserved'])

  const guests: DailyGuestRow[] = (input.bookings || [])
    .filter((b) => {
      const st = String(b.status || '').toLowerCase()
      if (!occupyingStatuses.has(st)) return false
      return isOccupyingHotelNight(b.check_in, b.check_out, date)
    })
    .map((b) => ({
      booking_id: b.id,
      guest_name: b.guests?.name || b.guest_name || 'Guest',
      room_number: b.rooms?.room_number || '—',
      room_type: b.rooms?.room_type || '—',
      rate_per_night: Number(b.rate_per_night) || 0,
      check_in: String(b.check_in).slice(0, 10),
      check_out: String(b.check_out).slice(0, 10),
      folio_id: b.folio_id || '—',
      payment_status: String(b.payment_status || '—'),
      status: String(b.status || ''),
    }))
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))

  const roomRevenueGenerated = guests.reduce((s, g) => s + g.rate_per_night, 0)

  const visibleTx = (input.transactions || []).filter((t) => {
    const st = String(t.status || '').toLowerCase()
    return st !== 'void' && st !== 'cancelled'
  })
  const outletNums = collectOutletPaidTransactionOrderNumbers(visibleTx as any)
  const payDeduped = filterDuplicatePaymentRows(
    (input.payments || []).filter((p) => !shouldHideOutletPaymentDuplicate(p.notes, outletNums)),
    visibleTx,
  )

  const lines: DailyCollectionLine[] = []

  for (const t of visibleTx) {
    const category = classifySalesCollectionCategory({
      reference: t.transaction_id,
      description: t.description,
      payment_method: t.payment_method,
      status: t.status,
    })
    const method = normMethod(t.payment_method)
    lines.push({
      id: t.id,
      guest_name: t.guest_name || 'Guest',
      room: t.room || '',
      amount: Number(t.amount) || 0,
      payment_method: method,
      category,
      reference: String(t.transaction_id || t.id),
      description: String(t.description || ''),
      payment_account_label: resolvePaymentAccountLabel({
        payment_account_label: t.payment_account_label,
        description: t.description,
      }),
      at: String(t.created_at || ''),
      counts_as_cash_collection: countsAsCashCollection(category, method, t.status),
    })
  }

  for (const p of payDeduped) {
    const category = classifySalesCollectionCategory({
      reference: p.reference_number,
      description: p.notes,
      payment_method: p.payment_method,
      status: 'paid',
    })
    const method = normMethod(p.payment_method)
    lines.push({
      id: `pay-${p.id}`,
      guest_name: p.guest_id
        ? input.guestNameById?.[p.guest_id] || 'Guest'
        : 'Walk-in / Outlet',
      room: '',
      amount: Number(p.amount) || 0,
      payment_method: method,
      category,
      reference: String(p.reference_number || p.id).slice(0, 24),
      description: String(p.notes || ''),
      payment_account_label: resolvePaymentAccountLabel({
        payment_account_label: p.payment_account_label,
        notes: p.notes,
      }),
      at: String(p.payment_date || ''),
      counts_as_cash_collection: countsAsCashCollection(category, method, 'paid'),
    })
  }

  lines.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const salesCollection = {
    total: 0,
    pos: 0,
    cash: 0,
    transfer: 0,
    advancePayment: 0,
    additionalPayment: 0,
    extraCharges: 0,
    debtRecovery: 0,
    other: 0,
    cityLedgerPosted: 0,
  }

  for (const line of lines) {
    const method = normMethod(line.payment_method)
    if (line.category === 'city_ledger' || method === 'city_ledger') {
      salesCollection.cityLedgerPosted += line.amount
      continue
    }
    if (!line.counts_as_cash_collection) continue

    const amt = Number(line.amount) || 0
    salesCollection.total += amt

    // Category buckets for the manual book; method buckets for uncategorized cash/POS/transfer.
    switch (line.category) {
      case 'advance_payment':
        salesCollection.advancePayment += amt
        break
      case 'additional_payment':
        salesCollection.additionalPayment += amt
        break
      case 'extra_charges':
        salesCollection.extraCharges += amt
        break
      case 'debt_recovery':
        salesCollection.debtRecovery += amt
        break
      case 'pos':
        salesCollection.pos += amt
        break
      case 'cash':
        salesCollection.cash += amt
        break
      case 'transfer':
        salesCollection.transfer += amt
        break
      default:
        if (method === 'pos') salesCollection.pos += amt
        else if (method === 'cash') salesCollection.cash += amt
        else if (method === 'transfer' || method === 'bank_transfer') {
          salesCollection.transfer += amt
        } else {
          salesCollection.other += amt
        }
        break
    }
  }

  return {
    date,
    guests,
    roomRevenueGenerated,
    guestCount: guests.length,
    salesCollection,
    lines,
  }
}

export const SALES_COLLECTION_LABELS: Record<SalesCollectionCategory, string> = {
  pos: 'POS',
  cash: 'Cash',
  transfer: 'Bank transfer',
  advance_payment: 'Advance payment',
  additional_payment: 'Additional (Extend stay etc)',
  extra_charges: 'Extra charges',
  debt_recovery: 'Debt recovery',
  city_ledger: 'City ledger (posted)',
  other: 'Other',
}
