import type { PurchaseOrder, RetirementLine } from '@/lib/supply-chain/types'

function lineNotBought(line: RetirementLine) {
  return line.notBought === true || line.removed === true
}

/** Qty already posted to Central Store for a PO line (sum of stocked retirement rows). */
export function stockedQtyForPoLine(po: PurchaseOrder, lineId: string): number {
  const seen = new Set<string>()
  let total = 0
  for (const l of po.retirement?.lines ?? []) {
    if (l.lineId !== lineId || lineNotBought(l) || !l.stockedAt) continue
    const key = `${l.stockedAt}|${l.quantityBought}|${l.actualPrice}|${l.newlyAdded ? 1 : 0}`
    if (seen.has(key)) continue
    seen.add(key)
    total += Number(l.quantityBought) || 0
  }
  return total
}

/** Remaining purchase qty that can still be added to stock for an original PO line. */
export function remainingQtyForPoLine(po: PurchaseOrder, lineId: string): number {
  const ordered =
    po.lines.find((l) => l.id === lineId)?.quantityOrdered ?? 0
  return Math.max(0, ordered - stockedQtyForPoLine(po, lineId))
}

/** True when this PO still has original lines that can be added to stock. */
export function poHasRemainingAddToStockLines(po: PurchaseOrder): boolean {
  return po.lines.some((l) => remainingQtyForPoLine(po, l.id) > 0)
}

/** Active tab: approved/disbursed POs still open for Add to stock (including partial). */
export function isAddToStockCandidate(status: string): boolean {
  return [
    'disbursed',
    'approved',
    'retirement_pending',
    'retirement_pending_accountant',
    'retirement_rejected',
  ].includes(status)
}

/** Retirement tab: Add-to-stock batches awaiting accountant / manager finalisation. */
export function isRetirementReviewCandidate(status: string): boolean {
  return status === 'retirement_pending_accountant'
}
