/**
 * Sales collection (financial report + monthly P&L) must count each receipt once.
 *
 * Check-in, booking, and outlet settlement write the same cash to `transactions`
 * and `payments`. Daily book hides the duplicate. This report used to add both.
 *
 * Keep the payment row (it is what department filters treat as accommodation when
 * it has a booking) and drop the matching transaction. Outlet OUT-* receipts are
 * already represented by the payment, or are city-ledger charges with no cash.
 */

import { shouldHideBookingPaymentDuplicate } from '@/lib/payments/dedupe-ledger-rows'
import type { LedgerPaymentLike, LedgerTxLike } from '@/lib/payments/dedupe-ledger-rows'
import {
  isPaymentForVoidedOutletOrder,
  skipOutletTxnInSalesCollection,
} from '@/lib/outlets/outlet-financial-integration'
import {
  resolveRevenueCategory,
  type RevenueDepartment,
} from '@/lib/reports/revenue-category'

export type SalesCollectionPaymentRow = LedgerPaymentLike & {
  notes?: string | null
}

export type SalesCollectionTransactionRow = LedgerTxLike & {
  description?: string | null
}

export type SalesCollectionInflows = {
  payments: SalesCollectionPaymentRow[]
  transactions: SalesCollectionTransactionRow[]
  paymentsTotal: number
  transactionsTotal: number
  gross: number
}

function classifyPayment(row: SalesCollectionPaymentRow): RevenueDepartment {
  if (row.booking_id) return 'accommodation'
  return resolveRevenueCategory(null, 'charge', String(row.notes || ''))
}

function classifyTransaction(row: SalesCollectionTransactionRow): RevenueDepartment {
  return resolveRevenueCategory(null, 'charge', row.description || '')
}

function inDepartment(department: string, category: RevenueDepartment): boolean {
  return department === 'all' || department === category
}

export function summarizeSalesCollection(input: {
  payments: readonly SalesCollectionPaymentRow[]
  transactions: readonly SalesCollectionTransactionRow[]
  voidedOutletOrderNumbers?: ReadonlySet<string>
  department?: string
}): SalesCollectionInflows {
  const department = (input.department || 'all').toLowerCase()
  const voided = input.voidedOutletOrderNumbers ?? new Set<string>()

  const candidatePayments = input.payments.filter((row) => {
    const amount = Number(row.amount) || 0
    if (amount <= 0) return false
    if (isPaymentForVoidedOutletOrder(row.notes, voided as Set<string>)) return false
    return true
  })

  const candidateTransactions = input.transactions.filter((row) => {
    const status = String(row.status || '').toLowerCase()
    if (status === 'void' || status === 'cancelled') return false
    const amount = Number(row.amount) || 0
    if (amount <= 0) return false
    if (skipOutletTxnInSalesCollection(row)) return false
    // Same receipt already kept as a payment (check-in / booking dual-write).
    // Match before the department filter so the duplicate cannot reappear under
    // another department (check-in text classifies as "other").
    if (candidatePayments.some((payment) => shouldHideBookingPaymentDuplicate(payment, [row]))) {
      return false
    }
    return true
  })

  const payments = candidatePayments.filter((row) => inDepartment(department, classifyPayment(row)))
  const transactions = candidateTransactions.filter((row) =>
    inDepartment(department, classifyTransaction(row)),
  )

  const paymentsTotal = payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const transactionsTotal = transactions.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  return {
    payments,
    transactions,
    paymentsTotal,
    transactionsTotal,
    gross: paymentsTotal + transactionsTotal,
  }
}
