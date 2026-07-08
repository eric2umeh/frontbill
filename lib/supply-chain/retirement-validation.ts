import type { PurchaseOrder, RetirementLine } from './types'
import { isPurchasingRetireCandidate } from './po-format'

export function validateRetirementSubmission(
  po: PurchaseOrder,
  lines: RetirementLine[],
): string | null {
  if (!isPurchasingRetireCandidate(po.status)) {
    return 'Only disbursed or rejected purchase orders can be retired'
  }
  if (lines.length === 0) {
    return 'Retirement must include every purchase-order line'
  }

  const expectedLineIds = new Set(po.lines.map((line) => line.id))
  const seenLineIds = new Set<string>()

  for (const line of lines) {
    if (!expectedLineIds.has(line.lineId)) {
      return `Retirement contains an unknown line: ${line.name || line.lineId}`
    }
    if (seenLineIds.has(line.lineId)) {
      return `Retirement contains a duplicate line: ${line.name || line.lineId}`
    }
    seenLineIds.add(line.lineId)

    const notBought = line.notBought === true || line.removed === true
    if (!notBought) {
      if (!Number.isFinite(line.quantityBought) || line.quantityBought <= 0) {
        return `Enter a bought quantity for ${line.name}`
      }
      if (!Number.isFinite(line.totalPaid) || line.totalPaid < 0) {
        return `Enter a valid total paid for ${line.name}`
      }
    }
  }

  for (const expectedLineId of expectedLineIds) {
    if (!seenLineIds.has(expectedLineId)) {
      const poLine = po.lines.find((line) => line.id === expectedLineId)
      return `Retirement is missing ${poLine?.name || 'a purchase-order line'}`
    }
  }

  return null
}
