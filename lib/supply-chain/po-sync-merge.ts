import type {
  AddToStockBatch,
  PurchaseOrder,
  PoStatus,
  RetirementLine,
  RetirementRecord,
} from '@/lib/supply-chain/types'
import { ensurePoApprovalFreeze } from '@/lib/supply-chain/po-format'
import { hasPendingRetirementReview } from '@/lib/supply-chain/add-to-stock'

/** Higher = further along the PO workflow (prefer when merging local vs remote). */
const PO_STATUS_RANK: Record<PoStatus, number> = {
  draft: 0,
  accountant_rejected: 5,
  manager_rejected: 5,
  pending_store: 8,
  pending_accountant: 10,
  pending_manager: 20,
  approved: 30,
  disbursed: 40,
  retirement_pending: 45,
  // Rejected must not rank below pending — otherwise equal clocks resurrect the queue.
  retirement_pending_accountant: 48,
  retirement_rejected: 49,
  retired: 100,
}

function poRank(po: PurchaseOrder | undefined): number {
  if (!po) return -1
  return PO_STATUS_RANK[po.status] ?? 0
}

function poTieBreaker(po: PurchaseOrder): number {
  const r = po.retirement
  const reviewed = r?.reviewedAt ? Date.parse(r.reviewedAt) : 0
  const submitted = r?.submittedAt ? Date.parse(r.submittedAt) : 0
  const created = po.createdAt ? Date.parse(po.createdAt) : 0
  return Math.max(reviewed, submitted, created)
}

/** Prefer explicit workflow clock so reject/resend is not undone by status rank. */
function poWorkflowTime(po: PurchaseOrder): number {
  if (po.workflowUpdatedAt) {
    const n = Date.parse(po.workflowUpdatedAt)
    if (Number.isFinite(n)) return n
  }
  const sentAcct = po.sentToAccountantAt ? Date.parse(po.sentToAccountantAt) : 0
  const sentStore = po.sentToStoreAt ? Date.parse(po.sentToStoreAt) : 0
  return Math.max(sentAcct, sentStore, poTieBreaker(po))
}

/** Newest line-edit clock — stops a stale empty draft from wiping a filled cart on merge. */
function poLinesContentTime(po: PurchaseOrder): number {
  const stamped = po.linesLastEditedAt ? Date.parse(po.linesLastEditedAt) : 0
  let maxLine = 0
  for (const line of po.lines ?? []) {
    const t = line.lastEditedAt
      ? Date.parse(line.lastEditedAt)
      : line.addedAt
        ? Date.parse(line.addedAt)
        : 0
    if (Number.isFinite(t) && t > maxLine) maxLine = t
  }
  return Math.max(Number.isFinite(stamped) ? stamped : 0, maxLine)
}

function poLineCount(po: PurchaseOrder): number {
  return Array.isArray(po.lines) ? po.lines.length : 0
}

function stockedRetirementCount(po: PurchaseOrder | undefined): number {
  if (!po?.retirement?.lines?.length) return 0
  return po.retirement.lines.filter(
    (l) =>
      !(l.notBought || l.removed) &&
      (Boolean(l.stockedAt) ||
        Boolean(l.batchId) ||
        l.reviewStatus === 'pending_review' ||
        l.reviewStatus === 'accepted' ||
        l.reviewStatus === 'rejected') &&
      Number(l.quantityBought) > 0,
  ).length
}

function retirementLineKey(l: RetirementLine): string {
  return [
    l.lineId,
    l.stockedAt ?? '',
    String(l.quantityBought),
    String(l.actualPrice),
    l.newlyAdded ? '1' : '0',
  ].join('|')
}

/** Union retirement lines / batches so a stale disbursed copy cannot erase Add-to-stock. */
export function mergeRetirementRecords(
  a?: RetirementRecord,
  b?: RetirementRecord,
): RetirementRecord | undefined {
  if (!a && !b) return undefined
  if (!a) return b
  if (!b) return a

  const batchesById = new Map<string, AddToStockBatch>()
  for (const batch of [...(a.batches ?? []), ...(b.batches ?? [])]) {
    if (!batch?.id) continue
    const existing = batchesById.get(batch.id)
    if (!existing) {
      batchesById.set(batch.id, batch)
      continue
    }
    const rank = (s?: string) =>
      s === 'accepted' ? 3 : s === 'rejected' ? 2 : s === 'pending_review' ? 1 : 0
    batchesById.set(
      batch.id,
      rank(batch.status) >= rank(existing.status) ? batch : existing,
    )
  }

  // Also prefer accepted/rejected reviewStatus on lines
  const byKey = new Map<string, RetirementLine>()
  for (const line of [...(a.lines ?? []), ...(b.lines ?? [])]) {
    const key = retirementLineKey(line)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, line)
      continue
    }
    const prefer =
      line.stockedAt && !existing.stockedAt
        ? line
        : (line.reviewStatus === 'accepted' || line.reviewStatus === 'rejected') &&
            existing.reviewStatus !== 'accepted' &&
            existing.reviewStatus !== 'rejected'
          ? line
          : existing
    byKey.set(key, prefer)
  }

  const lines = [...byKey.values()]
  const actualSpent = lines
    .filter((l) => !(l.notBought || l.removed))
    .reduce((s, l) => s + (Number(l.totalPaid) || 0), 0)
  const priceChanges = lines.filter(
    (l) => !(l.notBought || l.removed) && l.poPrice !== l.actualPrice,
  ).length

  const aSub = a.submittedAt ? Date.parse(a.submittedAt) : 0
  const bSub = b.submittedAt ? Date.parse(b.submittedAt) : 0
  const newerSubmit = aSub >= bSub ? a : b
  const aRev = a.reviewedAt ? Date.parse(a.reviewedAt) : 0
  const bRev = b.reviewedAt ? Date.parse(b.reviewedAt) : 0
  const newerReview = aRev >= bRev ? a : b

  return {
    actualSpent,
    refundToCashier: 0, // recomputed by callers when needed; keep cash side on PO
    priceChanges,
    lines,
    batches: [...batchesById.values()],
    submittedAt: newerSubmit.submittedAt || a.submittedAt || b.submittedAt,
    submittedBy: newerSubmit.submittedBy || a.submittedBy || b.submittedBy,
    accountantComment:
      newerReview.accountantComment ?? a.accountantComment ?? b.accountantComment,
    reviewedAt: newerReview.reviewedAt ?? a.reviewedAt ?? b.reviewedAt,
    reviewedBy: newerReview.reviewedBy ?? a.reviewedBy ?? b.reviewedBy,
  }
}

/**
 * After picking a winner, keep any stocked Add-to-stock progress from either copy
 * and heal status if a bare disbursed snapshot would otherwise wipe the review queue.
 */
function enrichWithRetirementProgress(
  winner: PurchaseOrder,
  other: PurchaseOrder,
): PurchaseOrder {
  const mergedRetirement = mergeRetirementRecords(winner.retirement, other.retirement)
  if (!mergedRetirement?.lines?.length) return winner

  const cash =
    Number(winner.cashDisbursed) > 0
      ? Number(winner.cashDisbursed)
      : Number(other.cashDisbursed) || Number(winner.totalAmount) || 0
  const refund = cash - mergedRetirement.actualSpent
  const retirement: RetirementRecord = {
    ...mergedRetirement,
    refundToCashier: refund,
  }

  const hasStocked = retirement.lines.some((l) =>
    Boolean(l.stockedAt || l.batchId || l.reviewStatus) &&
    !(l.notBought || l.removed) &&
    Number(l.quantityBought) > 0,
  )
  const probe: PurchaseOrder = { ...winner, retirement }
  const needsReview = hasPendingRetirementReview(probe)

  let status = winner.status
  // Never demote a completed retirement.
  if (winner.status === 'retired' || other.status === 'retired') {
    if (poWorkflowTime(winner) >= poWorkflowTime(other) && winner.status === 'retired') {
      status = 'retired'
    } else if (other.status === 'retired' && poWorkflowTime(other) >= poWorkflowTime(winner)) {
      status = 'retired'
    }
  } else if (needsReview) {
    // Only force the review queue when something is still pending Accept/Reject.
    if (
      status === 'disbursed' ||
      status === 'approved' ||
      status === 'retirement_pending' ||
      status === 'retirement_rejected'
    ) {
      status = 'retirement_pending_accountant'
    }
  } else if (hasStocked && status === 'retirement_pending_accountant') {
    // Stale pending with no pending batches — keep winner status if it already left review.
    if (other.status === 'disbursed' || other.status === 'retirement_rejected') {
      status = other.status
    }
  }

  // Ignore unused hasStocked-only promotion that used to wipe partial-accept Active POs.

  const workflowUpdatedAt =
    poWorkflowTime(winner) >= poWorkflowTime(other)
      ? winner.workflowUpdatedAt || other.workflowUpdatedAt
      : other.workflowUpdatedAt || winner.workflowUpdatedAt

  return {
    ...winner,
    status,
    workflowUpdatedAt,
    retirement,
    cashDisbursed: cash > 0 ? cash : winner.cashDisbursed,
  }
}

/** True when a newer retirement submit should beat an older accountant reject. */
function retirementResubmitBeatsReject(
  pending: PurchaseOrder,
  rejected: PurchaseOrder,
): boolean {
  const submitRaw =
    pending.retirement?.submittedAt || pending.workflowUpdatedAt || ''
  const rejectRaw =
    rejected.retirement?.reviewedAt || rejected.workflowUpdatedAt || ''
  const submit = submitRaw ? Date.parse(submitRaw) : 0
  const reject = rejectRaw ? Date.parse(rejectRaw) : 0
  return (
    Number.isFinite(submit) &&
    Number.isFinite(reject) &&
    submit > 0 &&
    reject > 0 &&
    submit > reject
  )
}

function pickByWorkflowAndRank(a: PurchaseOrder, b: PurchaseOrder): PurchaseOrder {
  // Same-stage reject must beat the pending it left (even though reject rank is lower).
  if (a.status === 'accountant_rejected' && b.status === 'pending_accountant') return a
  if (b.status === 'accountant_rejected' && a.status === 'pending_accountant') return b
  if (a.status === 'manager_rejected' && b.status === 'pending_manager') return a
  if (b.status === 'manager_rejected' && a.status === 'pending_manager') return b

  const ar = poRank(a)
  const br = poRank(b)
  // Prefer further-along approval status. Never revive "awaiting accountant" over
  // pending_manager / disbursed just because a stale poll has a newer clock (slow network).
  if (ar !== br) return ar > br ? a : b

  const at = poWorkflowTime(a)
  const bt = poWorkflowTime(b)
  if (at !== bt) return at > bt ? a : b

  const aContent = poLinesContentTime(a)
  const bContent = poLinesContentTime(b)
  if (aContent !== bContent) return aContent > bContent ? a : b

  const aLines = poLineCount(a)
  const bLines = poLineCount(b)
  if (aLines === 0 && bLines > 0) return b
  if (bLines === 0 && aLines > 0) return a
  if (aLines !== bLines) return aLines > bLines ? a : b

  return poTieBreaker(a) >= poTieBreaker(b) ? a : b
}

/**
 * Pick the newer / more authoritative PO when two copies conflict.
 * Reject must beat the pending stage it left unless a later resend advances the clock.
 * Soft-deletes (deletedAt) win when their clock is newer so refresh cannot resurrect them.
 */
export function preferPurchaseOrder(
  a: PurchaseOrder,
  b: PurchaseOrder,
): PurchaseOrder {
  const aDelRaw = a.deletedAt ? Date.parse(a.deletedAt) : 0
  const bDelRaw = b.deletedAt ? Date.parse(b.deletedAt) : 0
  const aDel = Number.isFinite(aDelRaw) ? aDelRaw : 0
  const bDel = Number.isFinite(bDelRaw) ? bDelRaw : 0
  if (aDel || bDel) {
    if (aDel !== bDel) return aDel > bDel ? a : b
    if (a.deletedAt && !b.deletedAt) return a
    if (b.deletedAt && !a.deletedAt) return b
  }

  if (a.status === 'retirement_rejected' && b.status === 'retirement_pending_accountant') {
    const chosen = retirementResubmitBeatsReject(b, a) ? b : a
    return enrichWithRetirementProgress(chosen, chosen === a ? b : a)
  }
  if (b.status === 'retirement_rejected' && a.status === 'retirement_pending_accountant') {
    const chosen = retirementResubmitBeatsReject(a, b) ? a : b
    return enrichWithRetirementProgress(chosen, chosen === a ? b : a)
  }

  // Never let a bare disbursed/approved snapshot erase stocked Add-to-stock progress.
  const aStocked = stockedRetirementCount(a)
  const bStocked = stockedRetirementCount(b)
  if (aStocked !== bStocked) {
    const richer = aStocked > bStocked ? a : b
    const leaner = aStocked > bStocked ? b : a
    // Retired always wins over in-flight add-to-stock when its clock is newer.
    if (leaner.status === 'retired' && poWorkflowTime(leaner) >= poWorkflowTime(richer)) {
      return enrichWithRetirementProgress(leaner, richer)
    }
    const chosen = pickByWorkflowAndRank(richer, leaner)
    // If pick somehow chose the leaner disbursed copy, still force richer progress in.
    return enrichWithRetirementProgress(
      stockedRetirementCount(chosen) >= stockedRetirementCount(richer) ? chosen : richer,
      leaner,
    )
  }

  const chosen = pickByWorkflowAndRank(a, b)
  return enrichWithRetirementProgress(chosen, chosen === a ? b : a)
}

/**
 * Collapse duplicate ids only.
 * Do NOT merge distinct POs that share a week label (`PO-W2026-33`) — store draft and
 * kitchen pending_store used to collide on that number and wipe each other's lines.
 */
export function dedupePurchaseOrders(orders: PurchaseOrder[]): PurchaseOrder[] {
  const byId = new Map<string, PurchaseOrder>()
  for (const po of orders) {
    if (!po?.id) continue
    const existing = byId.get(po.id)
    byId.set(po.id, existing ? preferPurchaseOrder(existing, po) : po)
  }

  return [...byId.values()]
    .map((po) => ensurePoApprovalFreeze(po))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Merge org snapshot POs with in-memory state — never roll back a newer local workflow step.
 * Rejected statuses rank below their pending stage, so workflow time + reject preference must win.
 */
export function mergePurchaseOrdersFromRemote(
  local: PurchaseOrder[],
  remote: PurchaseOrder[],
): PurchaseOrder[] {
  const localById = new Map(local.map((p) => [p.id, p]))
  const remoteById = new Map(remote.map((p) => [p.id, p]))
  const ids = new Set([...localById.keys(), ...remoteById.keys()])

  const merged: PurchaseOrder[] = []
  for (const id of ids) {
    const l = localById.get(id)
    const r = remoteById.get(id)
    if (!l) {
      if (r) merged.push(r)
      continue
    }
    if (!r) {
      merged.push(l)
      continue
    }
    merged.push(preferPurchaseOrder(l, r))
  }

  return dedupePurchaseOrders(merged)
}
