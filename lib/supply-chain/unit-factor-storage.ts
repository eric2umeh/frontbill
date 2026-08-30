import {
  formatUnitLabel,
  normalizeMeasurementUnit,
} from '@/lib/supply-chain/measurement-unit-core'
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
  const merged: UnitFactorMap = { ...(itemFactors ?? {}), ...overrides }

  // Reuse a reversed kitchen-measure entry (1 cup = N l) as 1 store-unit = N cups.
  for (const [key, count] of Object.entries(merged)) {
    if (!key.startsWith('__per_')) continue
    if (!(typeof count === 'number' && count > 0)) continue
    const measure = key.slice('__per_'.length)
    if (!isKitchenMeasureUnit(measure)) continue
    if (!(typeof merged[measure] === 'number' && merged[measure] > 0)) {
      merged[measure] = count
    }
  }
  return merged
}

/**
 * Kitchen measuring units: chef measures from catalogue SI stock.
 * Always store as 1 store-unit = N kitchen-units (1 litre = 3 cup).
 */
const KITCHEN_MEASURE_UNITS = new Set([
  'cup',
  'tbsp',
  'tsp',
  'cooking_spoon',
  'spoon',
])

/** Bought-as packs that contain catalogue units (1 pack = 9 pcs, 1 mudu = 1.5 kg). */
const PURCHASE_CONTAINER_UNITS = new Set([
  'crate',
  'pack',
  'bag',
  'ball',
  'basket',
  'tin',
  'can',
  'set',
  'roll',
  'carton',
  'mudu',
  'sachet',
  'head',
  'slice',
  'fillet',
  'leaf',
  'container',
  'cloves',
  'loaf',
  'bunch',
  'wrap',
  'derica',
  'bottle',
])

function isKitchenMeasureUnit(unit: string): boolean {
  return KITCHEN_MEASURE_UNITS.has(normalizeMeasurementUnit(unit))
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

  const storeLabel = formatUnitLabel(store)
  const selectedLabel = formatUnitLabel(selected)

  if (isKitchenMeasureUnit(selected) && !isKitchenMeasureUnit(store)) {
    return {
      storageKey: selected,
      label: `1 ${storeLabel} =`,
      suffix: selectedLabel,
    }
  }

  if (PURCHASE_CONTAINER_UNITS.has(selected) && !PURCHASE_CONTAINER_UNITS.has(store)) {
    return {
      storageKey: `__per_${selected}`,
      label: `1 ${selectedLabel} =`,
      suffix: storeLabel,
    }
  }

  return {
    storageKey: selected,
    label: `1 ${storeLabel} =`,
    suffix: selectedLabel,
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
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return false
  if (isKitchenMeasureUnit(from)) {
    const legacy = factors?.[`__per_${from}`]
    if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0) return false
  }
  return true
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

  const def = unitFactorDefinition(store, from)
  const defined = def ? factors?.[def.storageKey] : undefined
  if (typeof defined === 'number' && defined > 0) {
    return def!.storageKey.startsWith('__per_') ? qty * defined : qty / defined
  }

  const perStore = factors?.[from]
  if (perStore && perStore > 0) return qty / perStore

  const perContainer = factors?.[`__per_${from}`]
  if (perContainer && perContainer > 0) {
    // Legacy kitchen-measure rows were stored as 1 cup = N litre; treat N as cups per store unit.
    if (isKitchenMeasureUnit(from)) return qty / perContainer
    return qty * perContainer
  }

  return null
}

/** Convert store catalogue qty into the selected entry unit (inverse of convertToStoreUnitsWithFactors). */
export function convertFromStoreUnitsWithFactors(
  storeQty: number,
  toUnit: string,
  storeUnit: string,
  factors?: UnitFactorMap,
): number | null {
  const to = normalizeMeasurementUnit(toUnit)
  const store = normalizeMeasurementUnit(storeUnit)
  if (to === store) return storeQty

  const viaSi = convertQtyBetweenUnits(storeQty, store, to)
  if (viaSi != null) return viaSi

  const def = unitFactorDefinition(store, to)
  const defined = def ? factors?.[def.storageKey] : undefined
  if (typeof defined === 'number' && defined > 0) {
    return def!.storageKey.startsWith('__per_') ? storeQty / defined : storeQty * defined
  }

  const perStore = factors?.[to]
  if (perStore && perStore > 0) return storeQty * perStore

  const perContainer = factors?.[`__per_${to}`]
  if (perContainer && perContainer > 0) {
    if (isKitchenMeasureUnit(to)) return storeQty * perContainer
    return storeQty / perContainer
  }

  return null
}
