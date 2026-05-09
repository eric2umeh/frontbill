/** Matches paper form “store” checkboxes */
export const STORE_SECTION_OPTIONS = [
  { value: 'food_store', label: 'Food Store' },
  { value: 'beverage_store', label: 'Beverage Store' },
  { value: 'house_keeping', label: 'House Keeping' },
  { value: 'operation_equipment', label: 'Operation Equipment Store' },
  { value: 'others', label: 'Others' },
  { value: 'general', label: 'General' },
] as const

export type StoreSectionValue = (typeof STORE_SECTION_OPTIONS)[number]['value']

export const UNIT_OPTIONS = [
  'pcs',
  'kg',
  'g',
  'litre',
  'litr',
  'btts',
  'bottle',
  'pack',
  'roll',
  'cup',
  'mud',
  'rm',
  'can',
  'pkt',
  'other',
] as const

export type RequisitionStatus = 'submitted' | 'processing' | 'fulfilled' | 'cancelled'

export interface StoreRequisitionRow {
  id: string
  organization_id: string
  reference: string
  store_section: string
  department: string
  request_date: string
  status: RequisitionStatus
  requested_by: string | null
  fulfilled_by: string | null
  fulfilled_at: string | null
  received_by_name: string | null
  notes: string | null
  debit_account: string | null
  credit_account: string | null
  accountant_notes: string | null
  created_at: string
  updated_at: string
}

export interface StoreRequisitionLineRow {
  id: string
  requisition_id: string
  line_no: number
  item_description: string
  unit: string
  qty_required: number
  qty_issued: number | null
  unit_cost: number | null
  total_cost: number | null
  remark: string | null
}
