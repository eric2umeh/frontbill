export type PurchaseOrderStatus = 'draft' | 'locked' | 'cancelled'

export interface StorePurchaseOrderRow {
  id: string
  organization_id: string
  reference: string
  order_date: string
  department: string
  delivery_date: string | null
  purchase_request_ref: string | null
  notes: string | null
  status: PurchaseOrderStatus
  grand_total: number
  attachment_url: string | null
  created_by: string | null
  store_controller_by: string | null
  store_controller_at: string | null
  accountant_by: string | null
  accountant_at: string | null
  gm_by: string | null
  gm_at: string | null
  created_at: string
  updated_at: string
}

export interface StorePurchaseOrderLineRow {
  id: string
  purchase_order_id: string
  line_no: number
  ref_note: string | null
  item_description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
}

export type UnlockDocumentType = 'purchase_order' | 'requisition'

export interface StoreUnlockRequestRow {
  id: string
  organization_id: string
  document_type: UnlockDocumentType
  document_id: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requested_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}
