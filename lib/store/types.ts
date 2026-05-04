export type StoreMovementType = 'in' | 'out' | 'adjustment' | 'sale' | 'issue'

export interface StoreCategoryRow {
  id: string
  organization_id: string
  name: string
  slug: string
  sort_order: number
  created_at: string
  created_by?: string | null
  updated_by?: string | null
  updated_at?: string | null
}

export interface StoreItemRow {
  id: string
  organization_id: string
  category_id: string | null
  name: string
  sku: string | null
  unit: string
  quantity_on_hand: number
  reorder_level: number
  unit_price: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
}

export interface MovementRow {
  id: string
  organization_id: string
  item_id: string
  movement_type: StoreMovementType
  quantity: number
  balance_after: number | null
  reference: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  destination_department?: string | null
  received_by?: string | null
}
