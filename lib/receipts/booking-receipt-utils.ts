import type { PaymentReceiptChargeRow } from '@/components/receipts/payment-receipt-dialog'
import { formatNaira } from '@/lib/utils/currency'

export function folioRowEligibleForPaymentReceipt(charge: {
  type?: string
  amount?: number
  paymentStatus?: string
}): boolean {
  if (charge.type === 'payment') return true
  if (Number(charge.amount) < 0) return true
  const t = String(charge.type || '').toLowerCase()
  const paid = String(charge.paymentStatus || '').toLowerCase() === 'paid'
  if (paid && (t === 'extended_stay' || t === 'charge')) return true
  return false
}

export type PaymentLedgerReceiptRow = {
  id: string
  created_at: string
  amount: number
  payment_method: string | null
  description: string | null
  transaction_id: string | null
  receivedByLabel: string
}

export function transactionToReceiptChargeRow(
  tx: PaymentLedgerReceiptRow,
): PaymentReceiptChargeRow {
  const amt = Math.abs(Number(tx.amount) || 0)
  return {
    id: tx.id,
    timestamp: tx.created_at,
    description: tx.description || undefined,
    amount: -amt,
    type: 'payment',
    createdBy: tx.receivedByLabel,
    paymentMethod: tx.payment_method,
  }
}

export function buildFolioContextLinesForReceipt(
  charges: Array<{
    id?: string
    type?: string
    description?: string
    amount?: number
    paymentStatus?: string
  }>,
): string[] {
  const types = new Set([
    'room_charge',
    'additional_charge',
    'extended_stay',
    'reservation',
    'late_checkout',
    'charge',
  ])
  const lines: string[] = []
  for (const c of charges) {
    const t = String(c.type || '').toLowerCase()
    if (t === 'payment' || t === 'folio_note') continue
    if (!types.has(t)) continue
    const desc = String(c.description || '').trim() || t.replace(/_/g, ' ')
    const amt = Math.abs(Number(c.amount) || 0)
    const ps = String(c.paymentStatus || '').toLowerCase()
    let tag = ''
    if (ps === 'paid') tag = ' · Paid on spot'
    else if (ps === 'city_ledger') tag = ' · City ledger'
    else if (['pending', 'unpaid', 'partial'].includes(ps)) tag = ' · On folio / unpaid'
    lines.push(`${desc}: +${formatNaira(amt)}${tag}`)
  }
  return lines.slice(-24)
}

export function filterPaymentLedgerTransactions(
  txRows: Array<{
    transaction_id?: string | null
    description?: string | null
    status?: string | null
  }>,
) {
  return (txRows || []).filter((t) => {
    const st = String(t.status || '').toLowerCase()
    if (st === 'void' || st === 'cancelled') return false
    const tid = String(t.transaction_id || '')
    const desc = String(t.description || '').toLowerCase()
    if (tid.startsWith('PAY-')) return true
    if (desc.includes('payment received')) return true
    if (desc.includes('booking created')) return true
    if (desc.includes('city ledger top-up')) return true
    if (desc.includes('add credit') || desc.includes('via add credit')) return true
    if (desc.includes('reservation payment')) return true
    if (desc.includes('event payment')) return true
    return false
  })
}
