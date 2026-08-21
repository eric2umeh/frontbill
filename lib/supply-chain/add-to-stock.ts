import type {
  AddToStockBatch,
  PoStatus,
  PurchaseOrder,
  RetirementLine,
} from '@/lib/supply-chain/types'

function lineNotBought(line: RetirementLine) {
  return line.notBought === true || line.removed === true
}

function batchStatus(
  batch: AddToStockBatch,
): 'pending_review' | 'accepted' | 'rejected' {
  return batch.status ?? 'pending_review'
}

function lineReviewStatus(
  line: RetirementLine,
): 'pending_review' | 'accepted' | 'rejected' {
  if (line.reviewStatus === 'accepted' || line.reviewStatus === 'rejected') {
    return line.reviewStatus
  }
  // Legacy stocked rows (no reviewStatus) count as pending until accepted.
  return 'pending_review'
}

/** True when a retirement row was posted via Add to stock (not a draft). */
export function isPostedStockLine(line: RetirementLine): boolean {
  if (lineNotBought(line)) return false
  if (!(Number(line.quantityBought) > 0)) return false
  return (
    Boolean(line.stockedAt) ||
    Boolean(line.batchId) ||
    line.reviewStatus === 'pending_review' ||
    line.reviewStatus === 'accepted' ||
    line.reviewStatus === 'rejected'
  )
}

/** Qty already posted to Central Store for a PO line (sum of stocked retirement rows). */
export function stockedQtyForPoLine(po: PurchaseOrder, lineId: string): number {
  const seen = new Set<string>()
  let total = 0
  for (const l of po.retirement?.lines ?? []) {
    if (l.lineId !== lineId || !isPostedStockLine(l)) continue
    const key = [
      l.batchId ?? '',
      l.stockedAt ?? '',
      String(l.quantityBought),
      String(l.actualPrice),
      l.newlyAdded ? '1' : '0',
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    total += Number(l.quantityBought) || 0
  }
  return total
}

/**
 * True when this original PO line was already submitted in Add to stock.
 * One submit closes the line forever (qty/price changes are final).
 */
export function isPoLineSubmittedToStock(
  po: PurchaseOrder,
  lineId: string,
): boolean {
  return (po.retirement?.lines ?? []).some(
    (l) => l.lineId === lineId && isPostedStockLine(l),
  )
}

/**
 * Qty still available to add for an original PO line.
 * After any Add-to-stock submit for that line → 0 (no further edits).
 * Before submit → ordered qty (UI default; user may raise or lower on submit).
 */
export function remainingQtyForPoLine(po: PurchaseOrder, lineId: string): number {
  if (isPoLineSubmittedToStock(po, lineId)) return 0
  return po.lines.find((l) => l.id === lineId)?.quantityOrdered ?? 0
}

/** True when this PO still has original lines that have never been added to stock. */
export function poHasRemainingAddToStockLines(po: PurchaseOrder): boolean {
  return po.lines.some((l) => !isPoLineSubmittedToStock(po, l.id))
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

/** Batches still waiting for accountant/manager Accept or Reject. */
export function pendingReviewBatches(po: PurchaseOrder): AddToStockBatch[] {
  const batches = po.retirement?.batches ?? []
  if (batches.length) {
    return batches.filter((b) => batchStatus(b) === 'pending_review')
  }
  // Legacy: stocked lines with no batches → treat as one synthetic pending set.
  const pendingLines = pendingReviewLines(po)
  if (!pendingLines.length) return []
  return [
    {
      id: `legacy-${po.id}`,
      submittedAt:
        po.retirement?.submittedAt ||
        pendingLines[0]?.stockedAt ||
        po.workflowUpdatedAt ||
        po.createdAt,
      submittedBy: po.retirement?.submittedBy || pendingLines[0]?.stockedBy || 'Staff',
      lineIds: pendingLines.map((l) => l.lineId),
      actualSpent: pendingLines.reduce((s, l) => s + (Number(l.totalPaid) || 0), 0),
      status: 'pending_review',
    },
  ]
}

/** Stocked retirement rows awaiting Accept/Reject (not the whole PO). */
export function pendingReviewLines(po: PurchaseOrder): RetirementLine[] {
  const batches = po.retirement?.batches ?? []
  const pendingBatchIds = new Set(
    batches.filter((b) => batchStatus(b) === 'pending_review').map((b) => b.id),
  )

  return (po.retirement?.lines ?? []).filter((l) => {
    if (!isPostedStockLine(l)) return false
    if (l.batchId) {
      if (pendingBatchIds.size > 0) return pendingBatchIds.has(l.batchId)
      return lineReviewStatus(l) === 'pending_review'
    }
    // No batchId: pending until explicitly accepted/rejected.
    return lineReviewStatus(l) === 'pending_review'
  })
}

export function hasPendingRetirementReview(po: PurchaseOrder): boolean {
  return pendingReviewLines(po).length > 0 || pendingReviewBatches(po).length > 0
}

/** Retirement tab: POs that have at least one Add-to-stock batch awaiting review. */
export function isRetirementReviewCandidate(po: PurchaseOrder): boolean {
  if (po.deletedAt || po.status === 'retired') return false
  return hasPendingRetirementReview(po)
}

/**
 * After accepting/rejecting pending batches, pick the PO workflow status.
 * Remaining unstocked lines keep the PO on Active (disbursed / rejected).
 * Only fully stocked + accepted POs become retired.
 */
export function resolveStatusAfterRetirementBatchReview(
  po: PurchaseOrder,
  approved: boolean,
  nextLines: RetirementLine[],
  nextBatches: AddToStockBatch[],
): PoStatus {
  const probe: PurchaseOrder = {
    ...po,
    retirement: po.retirement
      ? { ...po.retirement, lines: nextLines, batches: nextBatches }
      : po.retirement,
  }
  const stillPending = hasPendingRetirementReview(probe)
  if (stillPending) return 'retirement_pending_accountant'

  const hasRemaining = poHasRemainingAddToStockLines(probe)
  if (hasRemaining) {
    return approved ? 'disbursed' : 'retirement_rejected'
  }

  // Everything that was ordered is already in stock (or no original lines left).
  return approved ? 'retired' : 'retirement_rejected'
}

/** Apply Accept/Reject to all currently pending batches + their lines. */
export function applyRetirementBatchDecision(
  po: PurchaseOrder,
  approved: boolean,
  comment: string,
  actorName: string,
  nowIso: string,
): {
  lines: RetirementLine[]
  batches: AddToStockBatch[]
  status: PoStatus
} {
  const prevBatches = po.retirement?.batches ?? []
  const prevLines = po.retirement?.lines ?? []
  const pendingIds = new Set(
    pendingReviewBatches(po)
      .map((b) => b.id)
      .filter((id) => !id.startsWith('legacy-')),
  )
  const hasLegacyPending =
    pendingReviewBatches(po).some((b) => b.id.startsWith('legacy-')) ||
    (prevBatches.length === 0 && pendingReviewLines(po).length > 0)

  const nextBatches: AddToStockBatch[] = prevBatches.map((b) => {
    if (batchStatus(b) !== 'pending_review') return b
    return {
      ...b,
      status: approved ? 'accepted' : 'rejected',
      reviewedAt: nowIso,
      reviewedBy: actorName,
      reviewComment: comment,
    }
  })

  // Legacy stocked rows with no batch list — create an accepted/rejected batch for audit.
  if (hasLegacyPending && prevBatches.length === 0) {
    const legacyLines = pendingReviewLines(po)
    nextBatches.push({
      id: `legacy-${po.id}-${nowIso.slice(0, 19)}`,
      submittedAt: po.retirement?.submittedAt || nowIso,
      submittedBy: po.retirement?.submittedBy || actorName,
      lineIds: legacyLines.map((l) => l.lineId),
      actualSpent: legacyLines.reduce((s, l) => s + (Number(l.totalPaid) || 0), 0),
      status: approved ? 'accepted' : 'rejected',
      reviewedAt: nowIso,
      reviewedBy: actorName,
      reviewComment: comment,
    })
  }

  const decidedBatchIds = new Set(
    nextBatches
      .filter((b) => b.status === (approved ? 'accepted' : 'rejected') && b.reviewedAt === nowIso)
      .map((b) => b.id),
  )

  const nextLines = prevLines.map((l) => {
    if (lineNotBought(l) || !l.stockedAt) return l
    if (l.reviewStatus === 'accepted' || l.reviewStatus === 'rejected') return l
    if (l.batchId && pendingIds.has(l.batchId)) {
      return {
        ...l,
        reviewStatus: approved ? ('accepted' as const) : ('rejected' as const),
      }
    }
    if (!l.batchId && hasLegacyPending) {
      const legacyBatch = nextBatches.find((b) => b.id.startsWith('legacy-'))
      return {
        ...l,
        batchId: l.batchId ?? legacyBatch?.id,
        reviewStatus: approved ? ('accepted' as const) : ('rejected' as const),
      }
    }
    if (l.batchId && decidedBatchIds.has(l.batchId)) {
      return {
        ...l,
        reviewStatus: approved ? ('accepted' as const) : ('rejected' as const),
      }
    }
    return l
  })

  const status = resolveStatusAfterRetirementBatchReview(
    po,
    approved,
    nextLines,
    nextBatches,
  )

  return { lines: nextLines, batches: nextBatches, status }
}
