import type { PurchaseOrder, PoStatus } from '@/lib/supply-chain/types'

/** Higher = further along the PO workflow (prefer when merging local vs remote). */
const PO_STATUS_RANK: Record<PoStatus, number> = {
  draft: 0,
  accountant_rejected: 5,
  manager_rejected: 5,
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

/**
 * Merge org snapshot POs with in-memory state — never roll back a newer local workflow step.
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

    const lr = poRank(l)
    const rr = poRank(r)
    if (lr > rr) merged.push(l)
    else if (rr > lr) merged.push(r)
    else merged.push(poTieBreaker(l) >= poTieBreaker(r) ? l : r)
  }

  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
