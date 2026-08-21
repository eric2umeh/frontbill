import { canonicalRoleKey, hasPermission } from '@/lib/permissions'
import {
  KITCHEN_WRITE_SNAPSHOT_KEYS,
  type SupplySnapshotKey,
} from '@/lib/supply-chain/supply-db-mappers'

/** Who may GET org supply snapshots (bar stock, issue log, PO JSON). PUT stays write-gated. */
export function canReadSupplySnapshots(role: string | null | undefined): boolean {
  if (
    hasPermission(role, 'supply:store') ||
    hasPermission(role, 'supply:kitchen') ||
    hasPermission(role, 'supply:purchasing') ||
    hasPermission(role, 'supply:approve_accountant') ||
    hasPermission(role, 'supply:approve_manager') ||
    hasPermission(role, 'supply:activity') ||
    hasPermission(role, 'outlet:view') ||
    hasPermission(role, 'outlet:sell')
  ) {
    return true
  }
  const key = canonicalRoleKey(role)
  return (
    key === 'admin' ||
    key === 'superadmin' ||
    key === 'manager' ||
    key === 'accountant' ||
    key === 'auditor' ||
    key === 'food_beverage' ||
    key === 'cashier' ||
    key === 'laundry' ||
    key === 'gym'
  )
}

export function snapshotsPayloadForRole(
  all: Partial<Record<SupplySnapshotKey, unknown>>,
  role: string | null | undefined,
): Partial<Record<SupplySnapshotKey, unknown>> {
  if (hasPermission(role, 'supply:store')) return all
  // PO reviewers must sync purchase_orders after approve/reject even without store catalogue write.
  if (
    hasPermission(role, 'supply:approve_accountant') ||
    hasPermission(role, 'supply:approve_manager') ||
    hasPermission(role, 'supply:purchasing')
  ) {
    const out: Partial<Record<SupplySnapshotKey, unknown>> = {}
    if ('purchase_orders' in all) out.purchase_orders = all.purchase_orders
    if ('activity_log' in all) out.activity_log = all.activity_log
    if (hasPermission(role, 'supply:purchasing') && 'basket' in all) {
      out.basket = all.basket
    }
    return out
  }
  if (!hasPermission(role, 'supply:kitchen')) return {}

  const out: Partial<Record<SupplySnapshotKey, unknown>> = {}
  for (const key of KITCHEN_WRITE_SNAPSHOT_KEYS) {
    if (key in all) out[key] = all[key]
  }
  return out
}
