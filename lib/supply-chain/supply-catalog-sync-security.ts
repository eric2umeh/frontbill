import { canManageStoreCatalog } from '../permissions'

export type CatalogOwnershipRow = {
  organization_id?: string | null
}

export function canSyncSupplyCatalog(role: string | null | undefined): boolean {
  return canManageStoreCatalog(role)
}

export function hasForeignCatalogOwnership(
  rows: CatalogOwnershipRow[] | null | undefined,
  orgId: string,
): boolean {
  return (rows ?? []).some((row) => row.organization_id !== orgId)
}
