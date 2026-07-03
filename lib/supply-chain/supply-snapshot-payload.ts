import { hasPermission } from '@/lib/permissions'
import {
  KITCHEN_WRITE_SNAPSHOT_KEYS,
  type SupplySnapshotKey,
} from '@/lib/supply-chain/supply-db-mappers'

export function snapshotsPayloadForRole(
  all: Partial<Record<SupplySnapshotKey, unknown>>,
  role: string | null | undefined,
): Partial<Record<SupplySnapshotKey, unknown>> {
  if (hasPermission(role, 'supply:store')) return all
  if (!hasPermission(role, 'supply:kitchen')) return {}

  const out: Partial<Record<SupplySnapshotKey, unknown>> = {}
  for (const key of KITCHEN_WRITE_SNAPSHOT_KEYS) {
    if (key in all) out[key] = all[key]
  }
  return out
}
