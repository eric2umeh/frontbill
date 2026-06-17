import { normalizeMeasurementUnit } from '@/lib/supply-chain/measurement-unit-core'
import { convertQtyBetweenUnits } from '@/lib/supply-chain/recipe-units'
import type { UnitFactorMap } from '@/lib/supply-chain/unit-factor-types'

export type { UnitFactorMap } from '@/lib/supply-chain/unit-factor-types'

const STORAGE_KEY = 'frontbill_store_unit_factors'

export function readUnitFactorOverrides(): Record<string, UnitFactorMap> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, UnitFactorMap>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeUnitFactorOverride(
  storeItemId: string,
  storageKey: string,
  count: number,
): UnitFactorMap {
  const all = readUnitFactorOverrides()
  const nextItem = { ...(all[storeItemId] ?? {}), [storageKey]: count }
  all[storeItemId] = nextItem
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  }
  return nextItem
}

export function mergeUnitFactors(
  storeItemId: string,
  storeUnit: string,
  itemFactors?: UnitFactorMap,
): UnitFactorMap {
  const overrides = readUnitFactorOverrides()[storeItemId] ?? {}
  return { ...(itemFactors ?? {}), ...overrides }
}

/** How to store & label a custom conversion for this unit pair. */
export function unitFactorDefinition(
  storeUnit: string,
  selectedUnit: string,
): { storageKey: string; label: string; suffix: string } | null {
  const store = normalizeMeasurementUnit(storeUnit)
  const selected = normalizeMeasurementUnit(selectedUnit)
  if (store === selected) return null
  if (convertQtyBetweenUnits(1, selected, store) != null) return null

  const containerUnits = new Set(['crate', 'pack', 'bag', 'basket', 'tin', 'set', 'roll'])
  if (containerUnits.has(selected) && !containerUnits.has(store)) {
    return {
      storageKey: `__per_${selected}`,
      label: `1 ${selected} =`,
      suffix: store,
    }
  }

  return {
    storageKey: selected,
    label: `1 ${store} =`,
    suffix: selected,
  }
}

export function needsUnitFactor(
  fromUnit: string,
  storeUnit: string,
  factors?: UnitFactorMap,
): boolean {
  const from = normalizeMeasurementUnit(fromUnit)
  const store = normalizeMeasurementUnit(storeUnit)
  if (from === store) return false
  if (convertQtyBetweenUnits(1, from, store) != null) return false
  const def = unitFactorDefinition(store, from)
  if (!def) return false
  const n = factors?.[def.storageKey]
  return !(Number.isFinite(n) && n > 0)
}

export function convertToStoreUnitsWithFactors(
  qty: number,
  fromUnit: string,
  storeUnit: string,
  factors?: UnitFactorMap,
): number | null {
  const from = normalizeMeasurementUnit(fromUnit)
  const store = normalizeMeasurementUnit(storeUnit)
  if (from === store) return qty

  const viaSi = convertQtyBetweenUnits(qty, from, store)
  if (viaSi != null) return viaSi

  const perStore = factors?.[from]
  if (perStore && perStore > 0) return qty / perStore

  const perContainer = factors?.[`__per_${from}`]
  if (perContainer && perContainer > 0) return qty * perContainer

  return null
}
