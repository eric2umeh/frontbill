import type { RevenueDepartment } from '@/lib/reports/revenue-category'

/** POS / menu department keys (URL segment + DB `department` column). */
export type OutletDepartmentKey =
  | 'restaurant'
  | 'main_bar'
  | 'pool_bar'
  | 'banquets'
  | 'laundry'
  | 'gym'

export type OutletDepartmentGroup = 'fnb' | 'laundry' | 'gym' | 'banquets'

export interface OutletDepartmentDef {
  key: OutletDepartmentKey
  label: string
  shortLabel: string
  group: OutletDepartmentGroup
  revenueCategory: RevenueDepartment
  /** Default section tag on menu cards (e.g. Alcohol). */
  defaultTagLabel?: string
  icon: 'utensils' | 'wine' | 'waves' | 'party' | 'shirt' | 'dumbbell'
}

export const OUTLET_DEPARTMENTS: OutletDepartmentDef[] = [
  {
    key: 'restaurant',
    label: 'Restaurant',
    shortLabel: 'Restaurant',
    group: 'fnb',
    revenueCategory: 'restaurant',
    icon: 'utensils',
  },
  {
    key: 'main_bar',
    label: 'Main Bar',
    shortLabel: 'Main Bar',
    group: 'fnb',
    revenueCategory: 'bar',
    defaultTagLabel: 'Alcohol',
    icon: 'wine',
  },
  {
    key: 'pool_bar',
    label: 'Pool Bar',
    shortLabel: 'Pool Bar',
    group: 'fnb',
    revenueCategory: 'bar',
    defaultTagLabel: 'Alcohol',
    icon: 'waves',
  },
  {
    key: 'banquets',
    label: 'Banquets & Events',
    shortLabel: 'Banquets',
    group: 'banquets',
    revenueCategory: 'events',
    icon: 'party',
  },
  {
    key: 'laundry',
    label: 'Laundry',
    shortLabel: 'Laundry',
    group: 'laundry',
    revenueCategory: 'laundry',
    icon: 'shirt',
  },
  {
    key: 'gym',
    label: 'Gym & Wellness',
    shortLabel: 'Gym',
    group: 'gym',
    revenueCategory: 'gym',
    icon: 'dumbbell',
  },
]

export function getOutletDepartment(key: string): OutletDepartmentDef | undefined {
  return OUTLET_DEPARTMENTS.find((d) => d.key === key)
}

export function isOutletDepartmentKey(key: string): key is OutletDepartmentKey {
  return OUTLET_DEPARTMENTS.find((d) => d.key === key) != null
}

/**
 * F&B aliases (fnb, f&b, food and beverage, food & beverage) map to restaurant + bar outlets.
 * These two POS departments are fed automatically from central store → kitchen / bar stock.
 */
export function isStoreControlledFnbOutlet(department: OutletDepartmentKey): boolean {
  return department === 'restaurant' || department === 'main_bar'
}

export function outletDepartmentLabel(key: string): string {
  return getOutletDepartment(key)?.label ?? key
}
