import type { PurchaseOrder, PoStatus } from '@/lib/supply-chain/types'

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
  retirement_rejected: 48,
  retirement_pending_accountant: 50,
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

/**
 * Pick the newer / more authoritative PO when two copies conflict.
 * Reject must beat the pending stage it left unless a later resend advances the clock.
 */
export function preferPurchaseOrder(
  a: PurchaseOrder,
  b: PurchaseOrder,
): PurchaseOrder {
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
  return poTieBreaker(a) >= poTieBreaker(b) ? a : b
}

/** Collapse duplicate ids / poNumbers after merge or load. */
export function dedupePurchaseOrders(orders: PurchaseOrder[]): PurchaseOrder[] {
  const byId = new Map<string, PurchaseOrder>()
  for (const po of orders) {
    if (!po?.id) continue
    const existing = byId.get(po.id)
    byId.set(po.id, existing ? preferPurchaseOrder(existing, po) : po)
  }

  const byNumber = new Map<string, PurchaseOrder>()
  for (const po of byId.values()) {
    const key = (po.poNumber || po.id).trim()
    const existing = byNumber.get(key)
    byNumber.set(key, existing ? preferPurchaseOrder(existing, po) : po)
  }

  return [...byNumber.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
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
