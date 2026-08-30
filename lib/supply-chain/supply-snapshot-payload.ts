import {
  canCountOutletDepartmentStock,
  canonicalRoleKey,
  hasPermission,
} from '@/lib/permissions'
import {
  KITCHEN_WRITE_SNAPSHOT_KEYS,
  OUTLET_STOCK_WRITE_SNAPSHOT_KEYS,
  SUPPLY_SNAPSHOT_KEYS,
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

function pickSnapshotKeys(
  all: Partial<Record<SupplySnapshotKey, unknown>>,
  keys: readonly SupplySnapshotKey[],
): Partial<Record<SupplySnapshotKey, unknown>> {
  const out: Partial<Record<SupplySnapshotKey, unknown>> = {}
  for (const key of keys) {
    if (key in all) out[key] = all[key]
  }
  return out
}

/** Keep only the snapshot keys a mutation actually changed (avoids F&B bar counts wiping kitchen stock). */
export function filterSnapshotPayload(
  payload: Partial<Record<SupplySnapshotKey, unknown>>,
  onlyKeys?: readonly SupplySnapshotKey[],
): Partial<Record<SupplySnapshotKey, unknown>> {
  if (!onlyKeys?.length) return payload
  return pickSnapshotKeys(payload, onlyKeys)
}

/**
 * Keys PUT /api/supply/state may upsert for this role.
 * `null` means Forbidden — same gate as store/kitchen writes, plus outlet stock counters.
 */
export function writableSnapshotKeysForStatePut(
  role: string | null | undefined,
): readonly SupplySnapshotKey[] | null {
  const canStoreKitchenWrite =
    hasPermission(role, 'supply:store') ||
    hasPermission(role, 'supply:kitchen') ||
    hasPermission(role, 'supply:purchasing') ||
    hasPermission(role, 'supply:approve_accountant') ||
    hasPermission(role, 'supply:approve_manager') ||
    hasPermission(role, 'supply:activity')
  const key = canonicalRoleKey(role)
  const privileged =
    key === 'admin' ||
    key === 'superadmin' ||
    key === 'manager' ||
    key === 'accountant' ||
    key === 'auditor'

  if (canStoreKitchenWrite || privileged) {
    if (hasPermission(role, 'supply:kitchen') && !hasPermission(role, 'supply:store')) {
      return KITCHEN_WRITE_SNAPSHOT_KEYS
    }
    return SUPPLY_SNAPSHOT_KEYS
  }
  if (canCountOutletDepartmentStock(role)) return OUTLET_STOCK_WRITE_SNAPSHOT_KEYS
  return null
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
  if (hasPermission(role, 'supply:kitchen')) {
    return pickSnapshotKeys(all, KITCHEN_WRITE_SNAPSHOT_KEYS)
  }
  if (canCountOutletDepartmentStock(role)) {
    return pickSnapshotKeys(all, OUTLET_STOCK_WRITE_SNAPSHOT_KEYS)
  }
  return {}
}
