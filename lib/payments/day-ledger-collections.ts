/**
 * Day collection totals matching the Transactions ledger:
 * merge `transactions` + `payments`, hide outlet + booking dual-writes, then sum.
 */

import {
  collectOutletPaidTransactionOrderNumbers,
  shouldHideOutletPaymentDuplicate,
} from '@/lib/outlets/outlet-financial-integration'
import { filterDuplicatePaymentRows } from '@/lib/payments/dedupe-ledger-rows'

export type DayCollectionRow = {
  amount: number
  payment_method: string
}

export type DayCollectionSummary = {
  totalRevenue: number
  count: number
  revenues: {
    cash: number
    pos: number
    transfer: number
    cityLedger: number
  }
  rows: DayCollectionRow[]
}

function methodBucket(method: string | null | undefined): keyof DayCollectionSummary['revenues'] | null {
  const m = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (m === 'cash') return 'cash'
  if (m === 'pos') return 'pos'
  if (m === 'transfer' || m === 'bank_transfer') return 'transfer'
  if (m === 'city_ledger') return 'cityLedger'
  return null
}

export function summarizeDayLedgerCollections(
  transactions: Array<{
    amount?: unknown
    payment_method?: string | null
    status?: string | null
    booking_id?: string | null
    created_at?: string | null
    transaction_id?: string | null
    guest_name?: string | null
    description?: string | null
  }>,
  payments: Array<{
    amount?: unknown
    payment_method?: string | null
    booking_id?: string | null
    payment_date?: string | null
    reference_number?: string | null
    notes?: string | null
  }>,
): DayCollectionSummary {
  const visibleTx = (transactions || []).filter((t) => {
    const st = String(t.status || '').toLowerCase()
    return st !== 'void' && st !== 'cancelled'
  })

  const outletOrderNumbers = collectOutletPaidTransactionOrderNumbers(visibleTx as any)
  const payAfterOutlet = (payments || []).filter(
    (p) => !shouldHideOutletPaymentDuplicate(p.notes, outletOrderNumbers),
  )
  const payDeduped = filterDuplicatePaymentRows(payAfterOutlet, visibleTx)

  const rows: DayCollectionRow[] = [
    ...visibleTx.map((t) => ({
      amount: Number(t.amount) || 0,
      payment_method: String(t.payment_method || ''),
    })),
    ...payDeduped.map((p) => ({
      amount: Number(p.amount) || 0,
      payment_method: String(p.payment_method || ''),
    })),
  ]

  const revenues = { cash: 0, pos: 0, transfer: 0, cityLedger: 0 }
  let totalRevenue = 0
  for (const row of rows) {
    totalRevenue += row.amount
    const bucket = methodBucket(row.payment_method)
    if (bucket) revenues[bucket] += row.amount
  }

  return { totalRevenue, count: rows.length, revenues, rows }
}
