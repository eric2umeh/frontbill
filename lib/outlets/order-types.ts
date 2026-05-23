import type { OutletOrderType } from '@/lib/outlets/types'

/** POS order-type dropdown order (all outlets). */
export const OUTLET_ORDER_TYPE_OPTIONS: { value: OutletOrderType; label: string }[] = [
  { value: 'room_service', label: 'Room service' },
  { value: 'dine_in', label: 'Dine in' },
  { value: 'takeaway', label: 'Take-away' },
  { value: 'walk_in', label: 'Walk-in' },
]

export const OUTLET_ORDER_TYPE_VALUES = new Set(
  OUTLET_ORDER_TYPE_OPTIONS.map((o) => o.value),
)

export function isOutletOrderType(value: string): value is OutletOrderType {
  return OUTLET_ORDER_TYPE_VALUES.has(value as OutletOrderType)
}

export function outletOrderTypeLabel(type: string): string {
  const found = OUTLET_ORDER_TYPE_OPTIONS.find((o) => o.value === type)
  return found?.label ?? type.replace(/_/g, ' ')
}
