import type { EventOtherServiceLine } from '@/lib/events/event-other-services'

export type HotelEventStatus = 'planned' | 'confirmed' | 'cancelled' | 'completed'

export interface HotelEventRow {
  id: string
  organization_id: string
  title: string
  description: string | null
  venue: string | null
  other_services?: EventOtherServiceLine[] | null
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: HotelEventStatus
  client_type: 'guest' | 'organization' | null
  client_name: string | null
  client_phone: string | null
  client_email: string | null
  guest_id: string | null
  client_organization_id: string | null
  expected_attendees: number | null
  estimated_value: number | null
  notes: string | null
  payment_method: string | null
  payment_status: 'paid' | 'partial' | 'pending' | null
  amount_paid: number | null
  balance: number | null
  remarks: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export const HOTEL_EVENT_STATUSES: { value: HotelEventStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const EVENT_VENUE_PRESETS = [
  'Rebecca Hall',
  'Floxy Hall',
  'Board Room',
  'Pool Deck',
] as const
