import { canManageKitchenBatchStandards, hasPermission } from '@/lib/permissions'
import {
  KITCHEN_WRITE_SNAPSHOT_KEYS,
  SUPPLY_SNAPSHOT_KEYS,
} from '@/lib/supply-chain/supply-db-mappers'

export function writableSupplySnapshotKeysForRole(role: string): Set<string> {
  const kitchenOnly = hasPermission(role, 'supply:kitchen') && !hasPermission(role, 'supply:store')
  const keys = new Set<string>(kitchenOnly ? KITCHEN_WRITE_SNAPSHOT_KEYS : SUPPLY_SNAPSHOT_KEYS)
  if (!canManageKitchenBatchStandards(role)) {
    keys.delete('recipes')
  }
  return keys
}
