export type UserRole = 'admin' | 'manager' | 'front_desk' | 'accountant'

export type RoomType = 'standard' | 'deluxe' | 'suite' | 'presidential' | 'conference_hall' | 'event_hall'
export type RoomStatus = 'available' | 'occupied' | 'maintenance' | 'reserved' | 'cleaning'

export type OrganizationType = 'government' | 'ngo' | 'private' | 'individual'

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'arrears'

export type PaymentMethod = 'cash' | 'pos' | 'transfer' | 'cheque' | 'credit'

export type TransactionType = 'charge' | 'payment' | 'adjustment'

export type EntityType = 'booking' | 'payment' | 'guest' | 'room' | 'organization'

export type ShiftType = 'morning' | 'afternoon' | 'night'
export type ReconciliationStatus = 'pending' | 'approved' | 'flagged' | 'resolved'

export interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  room_number: string
  room_type: RoomType
  floor: number | null
  rate_per_night: number
  status: RoomStatus
  amenities: string[] | null
  max_occupancy: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  type: OrganizationType
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  credit_limit: number
  outstanding_balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Guest {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string
  address: string | null
  id_type: string | null
  id_number: string | null
  nationality: string
  organization_id: string | null
  organization?: Organization
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  booking_number: string
  guest_id: string
  guest?: Guest
  room_id: string
  room?: Room
  organization_id: string | null
  organization?: Organization
  check_in: string
  check_out: string
  status: BookingStatus
  total_amount: number
  paid_amount: number
  balance: number
  payment_status: PaymentStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  payment_reference: string
  booking_id: string | null
  booking?: Booking
  guest_id: string | null
  guest?: Guest
  organization_id: string | null
  organization?: Organization
  amount: number
  payment_method: PaymentMethod
  payment_date: string
  notes: string | null
  received_by: string | null
  created_at: string
  updated_at: string
}

export interface CityLedger {
  id: string
  organization_id: string
  organization?: Organization
  booking_id: string | null
  booking?: Booking
  transaction_type: TransactionType
  amount: number
  description: string | null
  transaction_date: string
  created_by: string | null
  created_at: string
}

export interface Activity {
  id: string
  entity_type: EntityType
  entity_id: string
  action: string
  description: string | null
  metadata: Record<string, any> | null
  performed_by: string | null
  created_at: string
}

export interface Reconciliation {
  id: string
  shift_date: string
  shift_type: ShiftType
  staff_id: string
  expected_cash: number
  actual_cash: number
  expected_pos: number
  actual_pos: number
  expected_transfer: number
  actual_transfer: number
  total_expected: number
  total_actual: number
  variance: number
  status: ReconciliationStatus
  anomaly_flags: AnomalyFlag[]
  notes: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface AnomalyFlag {
  type: 'large_variance' | 'unusual_pattern' | 'missing_transactions' | 'duplicate_payment'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  amount?: number
  transaction_id?: string
}

export interface DashboardStats {
  total_revenue: number
  pending_payments: number
  occupied_rooms: number
  available_rooms: number
  checked_in_today: number
  checking_out_today: number
  outstanding_balance: number
  total_guests: number
}

export interface RevenueBreakdown {
  date: string
  payer_name: string
  payer_type: 'individual' | 'organization'
  guest_name: string
  amount: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  booking_number: string
  room_number: string
}
