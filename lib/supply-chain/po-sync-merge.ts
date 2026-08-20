import type { PurchaseOrder, PoStatus } from '@/lib/supply-chain/types'
import { ensurePoApprovalFreeze } from '@/lib/supply-chain/po-format'

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
    // Same clock (or only one tombstone): never resurrect a deleted PO from a live copy.
    if (a.deletedAt && !b.deletedAt) return a
    if (b.deletedAt && !a.deletedAt) return b
  }

  // Retirement reject vs pending: reject wins unless store resubmitted after the reject.
  // Do this before generic workflow clocks — remote pending often keeps an older
  // workflowUpdatedAt that can otherwise resurrect the review queue after refresh.
  if (a.status === 'retirement_rejected' && b.status === 'retirement_pending_accountant') {
    return retirementResubmitBeatsReject(b, a) ? b : a
  }
  if (b.status === 'retirement_rejected' && a.status === 'retirement_pending_accountant') {
    return retirementResubmitBeatsReject(a, b) ? a : b
  }

  const at = poWorkflowTime(a)
  const bt = poWorkflowTime(b)
  if (at !== bt) return at > bt ? a : b

  // Same clock: never let pending_* resurrect over a rejection of that stage
  if (a.status === 'accountant_rejected' && b.status === 'pending_accountant') return a
  if (b.status === 'accountant_rejected' && a.status === 'pending_accountant') return b
  if (a.status === 'manager_rejected' && b.status === 'pending_manager') return a
  if (b.status === 'manager_rejected' && a.status === 'pending_manager') return b

  const ar = poRank(a)
  const br = poRank(b)
  if (ar !== br) return ar > br ? a : b

  // Prefer newer line edits / clears before treating "empty vs filled".
  // Intentional Clear stamps linesLastEditedAt so empty can beat a stale filled copy.
  const aContent = poLinesContentTime(a)
  const bContent = poLinesContentTime(b)
  if (aContent !== bContent) return aContent > bContent ? a : b

  // Same content clock: never let an empty/stale copy erase a filled draft cart.
  const aLines = poLineCount(a)
  const bLines = poLineCount(b)
  if (aLines === 0 && bLines > 0) return b
  if (bLines === 0 && aLines > 0) return a
  if (aLines !== bLines) return aLines > bLines ? a : b

  return poTieBreaker(a) >= poTieBreaker(b) ? a : b
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
      // Remote-only: keep unless it is already a tombstone we can drop later.
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
