/** Supply chain — accountable F&B flow (mock-first, revamp branch). */

import type { BatchOutletMenuSync } from './batch-outlet-sync'
export type { BatchOutletMenuSync } from './batch-outlet-sync'

export type SupplyDept =
  | 'all'
  | 'kitchen'
  | 'main_bar'
  | 'restaurant'
  | 'general_store'
  | 'pastry'
  | 'account'
  | 'administration'
  | 'frozen'
  | 'beverage'
  | 'housekeeping'
  | 'maintenance'
  | 'front_office'
  | 'laundry'

/** Legacy persisted value — migrated to `main_bar` on load. */
export type LegacySupplyDept = SupplyDept | 'bar'

export const STORE_CATALOG_DEPTS: Exclude<SupplyDept, 'all'>[] = [
  'kitchen',
  'main_bar',
  'restaurant',
  'general_store',
  'pastry',
  'account',
  'administration',
  'frozen',
  'beverage',
  'housekeeping',
  'maintenance',
  'front_office',
  'laundry',
]

/** Dept options in add/edit store item UI (excludes internal legacy bucket). */
export const STORE_DEPT_PICKER_OPTIONS: Exclude<SupplyDept, 'all'>[] =
  STORE_CATALOG_DEPTS.filter((d) => d !== 'general_store')

/** Normalize legacy `bar` dept from older localStorage rows. */
export function normalizeSupplyDept(dept: string): Exclude<SupplyDept, 'all'> {
  if (dept === 'bar') return 'main_bar'
  if (STORE_CATALOG_DEPTS.includes(dept as Exclude<SupplyDept, 'all'>)) {
    return dept as Exclude<SupplyDept, 'all'>
  }
  return 'restaurant'
}

export function storeItemDepartments(
  item: Pick<StoreItem, 'dept' | 'depts'>,
): Exclude<SupplyDept, 'all'>[] {
  const primary = normalizeSupplyDept(item.dept)
  if (item.depts?.length) {
    const merged = item.depts.map((d) => normalizeSupplyDept(d))
    merged.push(primary)
    return [...new Set(merged)]
  }
  return [primary]
}

export function storeItemMatchesDept(
  item: Pick<StoreItem, 'dept' | 'depts'>,
  filter: SupplyDept,
): boolean {
  if (filter === 'all') return true
  return storeItemDepartments(item).includes(filter)
}

export function normalizeStoreItemDepts(
  depts: Exclude<SupplyDept, 'all'>[],
): { dept: Exclude<SupplyDept, 'all'>; depts?: Exclude<SupplyDept, 'all'>[] } {
  const unique = [...new Set(depts.filter(Boolean))]
  if (!unique.length) return { dept: 'kitchen' }
  if (unique.length === 1) return { dept: unique[0] }
  return { dept: unique[0], depts: unique }
}

/** Store catalogue rows that feed main/pool bar stock pipelines. */
export function isBarStoreDept(dept: string): boolean {
  return dept === 'main_bar' || dept === 'bar'
}

export type PoStatus =
  | 'draft'
  | 'pending_accountant'
  | 'accountant_rejected'
  | 'pending_manager'
  | 'manager_rejected'
  | 'approved'
  | 'disbursed'
  | 'retirement_pending'
  | 'retirement_pending_accountant'
  | 'retirement_rejected'
  | 'retired'

export type ActivityAction =
  | 'po_created'
  | 'po_submitted'
  | 'po_accountant_decision'
  | 'po_manager_decision'
  | 'po_disbursed'
  | 'retirement_submitted'
  | 'stock_received'
  | 'stock_issued_kitchen'
  | 'stock_issued_bar'
  | 'stock_issued_out'
  | 'batch_opened'
  | 'batch_closed'
  | 'fnb_order_posted'
  | 'recipe_updated'
  | 'low_stock_alert'

/** Kitchen raw-material grouping for batch builder & store catalogue. */
export type KitchenMaterialCategory =
  | 'protein'
  | 'rice_grains'
  | 'produce'
  | 'seasonings'
  | 'oils_fats'
  | 'soups_stews'
  | 'dairy'
  | 'other'

export const KITCHEN_MATERIAL_CATEGORY_LABELS: Record<KitchenMaterialCategory, string> = {
  protein: 'Protein',
  rice_grains: 'Rice & Grains',
  produce: 'Produce',
  seasonings: 'Seasonings & Spices',
  oils_fats: 'Oils & Fats',
  soups_stews: 'Soups & Stews',
  dairy: 'Dairy',
  other: 'Other',
}

export const KITCHEN_MATERIAL_CATEGORIES: KitchenMaterialCategory[] = [
  'protein',
  'rice_grains',
  'produce',
  'seasonings',
  'oils_fats',
  'soups_stews',
  'dairy',
  'other',
]

export interface StoreItem {
  id: string
  name: string
  unit: string
  dept: Exclude<SupplyDept, 'all'>
  /** When set, item appears under each dept with one shared on-hand qty. */
  depts?: Exclude<SupplyDept, 'all'>[]
  quantityInStore: number
  reorderLevel: number
  lastPrice: number
  benchmarkPrice: number
  /** Kitchen dept items only — drives category picker in batch builder. */
  kitchenCategory?: KitchenMaterialCategory
  /** Custom units per 1 catalogue unit (e.g. { bottle: 24 } = 1 crate has 24 bottles). */
  unitFactors?: Record<string, number>
}

/** Store clerk submission — requires admin/superadmin approval before catalogue add. */
export interface PendingStoreItem {
  id: string
  name: string
  unit: string
  dept: Exclude<SupplyDept, 'all'>
  /** When set, item appears under each dept with one shared on-hand qty. */
  depts?: Exclude<SupplyDept, 'all'>[]
  quantityInStore: number
  reorderLevel: number
  lastPrice: number
  benchmarkPrice: number
  kitchenCategory?: KitchenMaterialCategory
  status: 'pending' | 'approved' | 'rejected'
  submittedBy: string
  submittedByName: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
}

export interface IssueOutCartLine {
  storeItemId: string
  name: string
  /** Unit the user is issuing in (crate, bottle, kg, …). */
  unit: string
  /** Central store catalogue unit — used for stock deduction. */
  storeUnit: string
  dept: Exclude<SupplyDept, 'all'>
  /** Qty in `unit`. */
  quantity: number
  /** Max issuable in store catalogue units. */
  maxAvailable: number
}

export interface IssueOutRecord {
  id: string
  storeItemId: string
  itemName: string
  unit: string
  quantity: number
  destination: string
  receivedBy?: string
  receivedById?: string
  notes?: string
  issuedAt: string
  issuedBy: string
}

export interface BasketLine {
  stockItemId: string
  name: string
  dept: Exclude<SupplyDept, 'all'>
  unit: string
  qtyToBuy: number
  unitPrice: number
}

export interface PoLine {
  id: string
  stockItemId: string
  name: string
  dept: Exclude<SupplyDept, 'all'>
  unit: string
  quantityOrdered: number
  unitPrice: number
  lineTotal: number
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  weekLabel: string
  status: PoStatus
  createdBy: string
  createdByName: string
  createdAt: string
  cashDisbursed: number
  lines: PoLine[]
  totalAmount: number
  accountantComment?: string
  managerComment?: string
  retirementComment?: string
  retirement?: RetirementRecord
}

export interface RetirementLine {
  lineId: string
  name: string
  quantityOrdered: number
  quantityBought: number
  poPrice: number
  actualPrice: number
  totalPaid: number
  varianceReason?: string
  /** @deprecated use notBought */
  removed?: boolean
  /** When false, item was not purchased at market (shown with *). Default true = bought. */
  notBought?: boolean
}

export interface RetirementRecord {
  actualSpent: number
  refundToCashier: number
  priceChanges: number
  lines: RetirementLine[]
  submittedAt: string
  submittedBy: string
  accountantComment?: string
  reviewedAt?: string
  reviewedBy?: string
}

export interface RecipeIngredient {
  stockItemId: string
  name: string
  quantity: number
  unit: string
  cost: number
}

export interface Recipe {
  id: string
  name: string
  category: string
  yieldPortions: number
  yieldLabel: string
  ingredients: RecipeIngredient[]
  /** @deprecated use overheadLabour + overheadGas + overheadOther */
  overheadCost: number
  overheadLabour?: number
  overheadGas?: number
  overheadOther?: number
  sellingPricePerPortion: number
  /** Outlet POS listing — kitchen always supplies Restaurant; this picks where to sell. */
  outletMenuSync?: BatchOutletMenuSync
  /** @deprecated use outletMenuSync */
  fnbEligible?: boolean
}

export interface BatchMaterialLine {
  storeItemId: string
  name: string
  unit: string
  quantity: number
  unitCost: number
}

export interface CreateKitchenBatchInput {
  batchName: string
  menuCategory: string
  plannedPortions: number
  sellingPricePerPortion: number
  materials: BatchMaterialLine[]
  notes?: string
  /** Reuse kitchen stock row when linking to an existing Restaurant menu item. */
  kitchenStockId?: string
  overheadLabour?: number
  overheadGas?: number
  overheadOther?: number
  outletMenuSync?: BatchOutletMenuSync
  /** @deprecated use outletMenuSync */
  fnbEligible?: boolean
}

/** Draft new-batch cart — persisted while switching kitchen tabs. */
export interface KitchenBatchDraft {
  draftVersion?: number
  search: string
  menuCategory: string
  menuCategoryId: string | null
  batchName: string
  menuItemId: string | null
  linkedKitchenStockId: string | null
  plannedPortions: string
  sellingPrice: string
  overheadLabour: string
  overheadGas: string
  overheadOther: string
  outletMenuSync: BatchOutletMenuSync
  notes: string
  cart: BatchMaterialLine[]
}

export interface ProductionBatch {
  id: string
  recipeId?: string
  recipeName: string
  shift: string
  status: 'in_progress' | 'completed'
  plannedPortions: number
  actualPortions: number
  foodCostPct: number
  variancePct: number
  batchCost?: number
  sellingPricePerPortion?: number
  materialsUsed: string[]
  /** Raw materials deducted when batch opened — restored if in-progress batch is deleted. */
  deductedMaterials?: { storeItemId: string; quantity: number }[]
  kitchenStockId?: string
  openedAt: string
  openedBy: string
  createdBy?: string
  closedAt?: string
  disposition?: { sold: number; staff: number; waste: number; returned: number }
}

/** F&B raw stock — drinks/supplies issued from central store to Restaurant F&B. */
export interface FnbRawStockItem {
  id: string
  storeItemId: string
  name: string
  quantityOnHand: number
  reorderLevel: number
  unit: string
  sellingPricePerPortion?: number
}

export interface KitchenStockItem {
  id: string
  name: string
  source: 'produced' | 'issued_raw'
  availablePortions: number
  reorderLevel: number
  linkedRecipeId?: string
}

/** Flexible store → kitchen issue: raw qty in, portions out (yield varies by batch). */
export interface RawKitchenIssueInput {
  storeItemId: string
  rawQuantity: number
  portionsProduced: number
  /** Credit an existing kitchen stock row, or leave blank to create/update by name. */
  kitchenStockId?: string
  finishedItemName: string
  notes?: string
}

/** Raw kitchen materials at kitchen — issued from central store (kitchen dept). */
export interface KitchenRawStockItem {
  id: string
  storeItemId: string
  name: string
  quantityOnHand: number
  reorderLevel: number
  unit: string
}

/** Bar outlet stock — issued from central store (bar dept). */
export interface BarStockItem {
  id: string
  storeItemId: string
  name: string
  quantityOnHand: number
  reorderLevel: number
  unitsPerSale: number
  /** Sale unit from central store (bottle, can, litre, etc.). */
  unit: string
}

export interface FnbMenuItem {
  id: string
  name: string
  category: 'food' | 'drink'
  sellingPrice: number
  kitchenStockId: string
  portionsPerSale: number
}

export interface FnbOrder {
  id: string
  tableLabel: string
  lines: { menuItemId: string; name: string; qty: number; unitPrice: number }[]
  subtotal: number
  vat: number
  total: number
  settlement: string
  status: 'ordered' | 'preparing' | 'ready' | 'served' | 'paid'
  createdAt: string
}

export interface ActivityEntry {
  id: string
  action: ActivityAction
  actorName: string
  actorRole: string
  timestamp: string
  summary: string
  entityId?: string
}

export const DEPT_LABELS: Record<SupplyDept, string> = {
  all: 'All',
  kitchen: 'Kitchen',
  main_bar: 'Main Bar',
  restaurant: 'Restaurant',
  general_store: 'General Store',
  pastry: 'Pastry',
  account: 'Account',
  administration: 'Admin',
  frozen: 'Frozen',
  beverage: 'Beverage',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  front_office: 'Front Office',
  laundry: 'Laundry',
}

/** Picker options sorted A–Z by display label. */
export const STORE_DEPT_PICKER_OPTIONS_SORTED: Exclude<SupplyDept, 'all'>[] = [
  ...STORE_DEPT_PICKER_OPTIONS,
].sort((a, b) => DEPT_LABELS[a].localeCompare(DEPT_LABELS[b]))
