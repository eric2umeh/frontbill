import type { OutletDepartmentKey } from '@/lib/outlets/departments'

export type OutletOrderStatus = 'open' | 'settled' | 'void'
export type OutletOrderType = 'dine_in' | 'takeaway' | 'room_service' | 'walk_in'
export type OutletPaymentMethod = 'cash' | 'pos' | 'transfer' | 'card' | 'city_ledger' | 'room_charge'

export const OUTLET_ITEM_TAGS = [
  { key: 'available', label: 'Available' },
  { key: 'ready_to_serve', label: 'Ready to serve' },
  { key: 'food', label: 'Food' },
  { key: 'beverage', label: 'Beverage' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'spicy', label: 'Spicy' },
  { key: 'hot', label: 'Hot' },
  { key: 'cold', label: 'Cold' },
] as const

export type OutletItemTag = (typeof OUTLET_ITEM_TAGS)[number]['key']

export interface OutletMenuCategoryRow {
  id: string
  organization_id: string
  department: OutletDepartmentKey
  parent_id: string | null
  name: string
  slug: string
  sort_order: number
  tag_label: string | null
  /** When true, cashiers may change unit price on POS for this order only. */
  price_editable?: boolean | null
  created_at: string
  updated_at: string
}

export interface OutletMenuItemRow {
  id: string
  organization_id: string
  category_id: string | null
  department: OutletDepartmentKey
  name: string
  description: string
  unit_price: number
  sku: string | null
  tags: string[]
  is_active: boolean
  sort_order: number
  service_code: string | null
  created_at: string
  updated_at: string
}

export interface OutletOrderLineRow {
  id: string
  order_id: string
  item_id: string | null
  item_name: string
  qty: number
  unit_price: number
  line_total: number
}

export interface OutletOrderRow {
  id: string
  organization_id: string
  department: OutletDepartmentKey
  order_number: string
  status: OutletOrderStatus
  order_type: OutletOrderType
  guest_name: string | null
  room_number: string | null
  table_label: string | null
  waiter_name?: string | null
  waiter_id?: string | null
  booking_id: string | null
  subtotal: number
  room_service_fee?: number | null
  takeaway_fee?: number | null
  is_complimentary?: boolean | null
  payment_method: string | null
  folio_charge_id: string | null
  notes: string | null
  created_by: string | null
  settled_by: string | null
  created_at: string
  settled_at: string | null
  outlet_order_lines?: OutletOrderLineRow[]
}

export interface CartLine {
  /** Unique row id — same menu item can appear twice at different prices. */
  id: string
  item: OutletMenuItemRow
  qty: number
  /** Effective unit price for this order line only (may differ from menu default). */
  unitPrice: number
}

export type OutletClientOptionKind = 'guest' | 'organization' | 'ledger'

export interface OutletClientOption {
  kind: OutletClientOptionKind
  id: string
  name: string
  subtitle: string | null
  balance?: number
}
