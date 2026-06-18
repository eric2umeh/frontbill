import type { KitchenMaterialCategory, StoreItem, SupplyDept } from './types'
import {
  applyStoreItemDeptFields,
  normalizeStoreItemDepts,
  normalizeSupplyDept,
  sanitizeAssignableStoreDepts,
  storeItemDeptFieldsForDb,
  storeItemDepartments,
} from './types'

export type SupplyCatalogRow = {
  id: string
  organization_id: string
  name: string
  unit: string
  dept: string
  depts: string[] | null
  quantity_in_store: number
  reorder_level: number
  last_price: number
  benchmark_price: number
  kitchen_category: string | null
  unit_factors: Record<string, number> | null
  created_at: string
  updated_at: string
}

export function catalogRowToStoreItem(row: SupplyCatalogRow): StoreItem {
  const dept = normalizeSupplyDept(row.dept)
  const depts = row.depts?.length
    ? sanitizeAssignableStoreDepts(
        row.depts.map((d) => normalizeSupplyDept(d)) as Exclude<SupplyDept, 'all'>[],
      )
    : undefined
  const normalized = normalizeStoreItemDepts(depts?.length ? depts : [dept])
  return applyStoreItemDeptFields({
    id: row.id,
    name: row.name,
    unit: row.unit,
    dept: normalized.dept,
    depts: normalized.depts,
    quantityInStore: Number(row.quantity_in_store) || 0,
    reorderLevel: Number(row.reorder_level) || 0,
    lastPrice: Number(row.last_price) || 0,
    benchmarkPrice: Number(row.benchmark_price) || 0,
    kitchenCategory: (row.kitchen_category as KitchenMaterialCategory | null) ?? undefined,
    unitFactors: row.unit_factors ?? undefined,
  })
}

export function storeItemToCatalogInsert(
  item: StoreItem,
  orgId: string,
  userId?: string | null,
) {
  const { dept, depts } = storeItemDeptFieldsForDb(item)
  return {
    id: item.id,
    organization_id: orgId,
    name: item.name,
    unit: item.unit,
    dept,
    depts,
    quantity_in_store: Math.max(0, item.quantityInStore),
    reorder_level: Math.max(0, item.reorderLevel),
    last_price: Math.max(0, item.lastPrice),
    benchmark_price: Math.max(0, item.benchmarkPrice || item.lastPrice),
    kitchen_category: item.kitchenCategory ?? null,
    unit_factors: item.unitFactors ?? null,
    created_by: userId ?? null,
    updated_by: userId ?? null,
  }
}

export function storeItemToCatalogUpdate(
  item: Partial<StoreItem> & { id: string },
  userId?: string | null,
) {
  const patch: Record<string, unknown> = {
    updated_by: userId ?? null,
    updated_at: new Date().toISOString(),
  }
  if (item.name != null) patch.name = item.name
  if (item.unit != null) patch.unit = item.unit
  if (item.dept != null || item.depts != null) {
    const { dept, depts } = storeItemDeptFieldsForDb({
      dept: item.dept ?? 'kitchen',
      depts: item.depts,
    })
    patch.dept = dept
    patch.depts = depts
  }
  if (item.quantityInStore != null) patch.quantity_in_store = Math.max(0, item.quantityInStore)
  if (item.reorderLevel != null) patch.reorder_level = Math.max(0, item.reorderLevel)
  if (item.lastPrice != null) patch.last_price = Math.max(0, item.lastPrice)
  if (item.benchmarkPrice != null) patch.benchmark_price = Math.max(0, item.benchmarkPrice)
  if (item.kitchenCategory !== undefined) patch.kitchen_category = item.kitchenCategory
  if (item.unitFactors !== undefined) patch.unit_factors = item.unitFactors
  return patch
}

export const SUPPLY_SNAPSHOT_KEYS = [
  'recipes',
  'batches',
  'kitchen_stock',
  'kitchen_raw_stock',
  'bar_stock',
  'fnb_raw_stock',
  'purchase_orders',
  'issue_out_log',
  'activity_log',
  'pending_items',
  'basket',
] as const

export type SupplySnapshotKey = (typeof SUPPLY_SNAPSHOT_KEYS)[number]
