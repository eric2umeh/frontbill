import type { OutletDepartmentKey } from '@/lib/outlets/departments'

export type OutletOrderStatus = 'open' | 'settled' | 'void'
export type OutletOrderType = 'dine_in' | 'takeaway' | 'room_service'
export type OutletPaymentMethod = 'cash' | 'pos' | 'transfer' | 'card' | 'city_ledger' | 'room_charge'

export const OUTLET_ITEM_TAGS = [
  { key: 'ready_to_serve', label: 'Ready to serve' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'available', label: 'Available' },
  { key: 'food', label: 'Food' },
  { key: 'beverage', label: 'Beverage' },
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
  booking_id: string | null
  subtotal: number
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
  item: OutletMenuItemRow
  qty: number
}
