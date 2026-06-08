/** Supply chain — accountable F&B flow (mock-first, revamp branch). */

export type SupplyDept =
  | 'all'
  | 'kitchen'
  | 'bar'
  | 'housekeeping'
  | 'maintenance'
  | 'front_office'
  | 'laundry'

export type PoStatus =
  | 'draft'
  | 'pending_accountant'
  | 'accountant_rejected'
  | 'pending_manager'
  | 'manager_rejected'
  | 'approved'
  | 'disbursed'
  | 'retirement_pending'
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

export interface StoreItem {
  id: string
  name: string
  unit: string
  dept: Exclude<SupplyDept, 'all'>
  quantityInStore: number
  reorderLevel: number
  lastPrice: number
  benchmarkPrice: number
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
  removed?: boolean
}

export interface RetirementRecord {
  actualSpent: number
  refundToCashier: number
  priceChanges: number
  lines: RetirementLine[]
  submittedAt: string
  submittedBy: string
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
  overheadCost: number
  sellingPricePerPortion: number
}

export interface ProductionBatch {
  id: string
  recipeId: string
  recipeName: string
  shift: string
  status: 'in_progress' | 'completed'
  plannedPortions: number
  actualPortions: number
  foodCostPct: number
  variancePct: number
  materialsUsed: string[]
  openedAt: string
  openedBy: string
  closedAt?: string
  disposition?: { sold: number; staff: number; waste: number; returned: number }
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
  bar: 'Bar',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  front_office: 'Front Office',
  laundry: 'Laundry',
}
