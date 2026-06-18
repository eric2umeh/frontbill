import {
  DEFAULT_MEASUREMENT_UNIT,
  normalizeMeasurementUnit,
} from '@/lib/supply-chain/measurement-unit-core'
import {
  convertToStoreUnitsWithFactors,
  type UnitFactorMap,
} from '@/lib/supply-chain/unit-factor-storage'

export {
  DEFAULT_MEASUREMENT_UNIT,
  MEASUREMENT_UNITS,
  defaultUnitForStoreItem,
  normalizeMeasurementUnit,
  formatUnitLabel,
  unitOptionsForStoreItem,
  type MeasurementUnit,
} from '@/lib/supply-chain/measurement-unit-core'

/** Convert qty in `fromUnit` to store catalogue units (SI + custom pack factors). */
export function convertToStoreUnits(
  qty: number,
  fromUnit: string,
  storeUnit: string,
  unitFactors?: UnitFactorMap,
): number {
  const converted = convertToStoreUnitsWithFactors(
    qty,
    fromUnit,
    storeUnit,
    unitFactors,
  )
  if (converted != null) return converted
  return qty
}

/** Prevent awkward leading zeros while typing (e.g. 007 → 7, keep 0.5 and 1/4). */
export function sanitizeQuantityInput(raw: string): string {
  const text = raw.replace(/,/g, '.')
  if (!text || text === '0' || text.startsWith('0.') || text.includes('/')) return text
  if (/^0+\d/.test(text)) return text.replace(/^0+/, '')
  return text
}

function parseNumericToken(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1])
    const num = Number(mixed[2])
    const den = Number(mixed[3])
    if (Number.isFinite(whole) && Number.isFinite(num) && den > 0) {
      return whole + num / den
    }
  }

  const frac = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) {
    const num = Number(frac[1])
    const den = Number(frac[2])
    if (Number.isFinite(num) && den > 0) return num / den
  }

  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const UNIT_SUFFIX_PATTERN =
  /^(.+?)\s+(kg|g|ml|l|ltr|litre|liter|mudu|cups?|tbsp|tsp|pcs?|pieces?|tin|tins|can|cans|bottle|bottles|crate|crates|sachet|sachets|portion|portions|pac|pack|roll|rolls|spoon|spoons|set|sets|basket)$/i

/** Parse qty text like `0.3`, `1/4`, `0.4 kg`, optional trailing unit. */
export function parseQuantityInput(
  text: string,
  fallbackUnit = DEFAULT_MEASUREMENT_UNIT,
): { quantity: number; unit: string } | null {
  const raw = text.trim()
  if (!raw) return null

  const unitSuffix = raw.match(UNIT_SUFFIX_PATTERN)
  if (unitSuffix) {
    const qty = parseNumericToken(unitSuffix[1])
    if (qty == null || qty < 0) return null
    return {
      quantity: qty,
      unit: normalizeMeasurementUnit(unitSuffix[2]),
    }
  }

  const qty = parseNumericToken(raw)
  if (qty == null || qty < 0) return null
  return { quantity: qty, unit: fallbackUnit }
}

/** Parse qty text (supports 1/2, 1 1/2, 0.5) to a number; empty → 0. */
export function parseQuantityValue(text: string): number {
  const parsed = parseQuantityInput(text)
  if (parsed != null) return parsed.quantity
  const n = Number(text.trim().replace(/,/g, '.'))
  return Number.isFinite(n) ? n : 0
}

/** True when qty text is complete enough to commit (not mid-fraction like "1/"). */
export function isCompleteQuantityInput(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/\/\s*$/.test(t)) return false
  if (/\d+\s+\d+\s*$/.test(t) && !/\d+\s+\d+\s*\/\s*\d+\s*$/.test(t)) return false
  return parseQuantityInput(t) != null
}

/** Human-friendly display: 0.3 l → 300 ml, 0.4 kg → 400 g. */
export function formatQuantityDisplay(
  quantity: number,
  unit: string,
  storeUnit?: string,
  unitFactors?: UnitFactorMap,
): string {
  const u = normalizeMeasurementUnit(unit)
  if (!Number.isFinite(quantity) || quantity <= 0) return '—'

  if (u === 'l') {
    if (quantity < 1) return `${Math.round(quantity * 1000)} ml`
    return `${quantity} litre`
  }
  if (u === 'kg') {
    if (quantity < 1) return `${Math.round(quantity * 1000)} g`
    return `${quantity} kg`
  }
  if (storeUnit && unitFactors) {
    const store = normalizeMeasurementUnit(storeUnit)
    if (u !== store) {
      const inStore = convertToStoreUnitsWithFactors(quantity, u, store, unitFactors)
      if (inStore != null) {
        return `${quantity} ${u} (= ${inStore} ${store})`
      }
    }
  }
  if (u === 'ml' || u === 'g') return `${quantity} ${u}`
  if (u === 'cup' && quantity === 0.25) return '250 ml'
  return `${quantity} ${u}`
}

/** Cost for a recipe qty given store price per store unit (e.g. ₦10,000 / kg). */
export function materialCostForUnit(
  recipeQty: number,
  recipeUnit: string,
  storeUnit: string,
  pricePerStoreUnit: number,
  unitFactors?: UnitFactorMap,
): number {
  const qtyInStoreUnits = convertToStoreUnits(
    recipeQty,
    recipeUnit,
    storeUnit,
    unitFactors,
  )
  return Math.round(qtyInStoreUnits * pricePerStoreUnit * 100) / 100
}
