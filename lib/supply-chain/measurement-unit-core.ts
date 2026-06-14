/** All units — alphabetically sorted for dropdowns. */
export const MEASUREMENT_UNITS = [
  'basket',
  'bottle',
  'crate',
  'cup',
  'g',
  'kg',
  'l',
  'ml',
  'mudu',
  'pack',
  'pcs',
  'portion',
  'sachet',
  'set',
  'spoon',
  'tbsp',
  'tin',
  'tsp',
] as const

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number]

export const DEFAULT_MEASUREMENT_UNIT: MeasurementUnit = 'kg'

const UNIT_ALIASES: Record<string, string> = {
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  litres: 'l',
  litre: 'l',
  ltr: 'l',
  kg: 'kg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  mudu: 'mudu',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tsp: 'tsp',
  pcs: 'pcs',
  pc: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  tin: 'tin',
  tins: 'tin',
  bottle: 'bottle',
  bottles: 'bottle',
  crate: 'crate',
  crates: 'crate',
  sachet: 'sachet',
  sachets: 'sachet',
  portion: 'portion',
  portions: 'portion',
  pac: 'pack',
  pack: 'pack',
  spoon: 'spoon',
  spoons: 'spoon',
  set: 'set',
  sets: 'set',
  basket: 'basket',
}

export function normalizeMeasurementUnit(raw: string): string {
  const key = raw.trim().toLowerCase()
  if (!key) return DEFAULT_MEASUREMENT_UNIT
  return UNIT_ALIASES[key] ?? key
}

/** Display label for units in dropdowns and tables (`l` → `litre`). */
export function formatUnitLabel(unit: string): string {
  const normalized = normalizeMeasurementUnit(unit)
  if (normalized === 'l') return 'litre'
  if (normalized === 'ml') return 'ml'
  if (normalized === 'kg') return 'kg'
  if (normalized === 'g') return 'g'
  if (normalized === 'pcs') return 'pcs'
  return normalized
}

export function defaultUnitForStoreItem(unit?: string): string {
  const normalized = normalizeMeasurementUnit(unit ?? '')
  if (MEASUREMENT_UNITS.includes(normalized as MeasurementUnit)) return normalized
  return DEFAULT_MEASUREMENT_UNIT
}

/** Contextual unit choices (store unit + related SI / pack units), sorted. */
export function unitOptionsForStoreItem(storeUnit: string, itemName?: string): string[] {
  const base = normalizeMeasurementUnit(storeUnit)
  const name = (itemName ?? '').toLowerCase()
  const options = new Set<string>([base])

  if (base === 'kg' || base === 'g') {
    options.add('kg')
    options.add('g')
  }
  if (['l', 'ml', 'cup'].includes(base)) {
    options.add('l')
    options.add('ml')
    options.add('cup')
  }
  const beverageHint =
    ['crate', 'bottle', 'pack', 'pcs', 'tin'].includes(base) ||
    /\b(coke|pepsi|fanta|sprite|beer|drink|juice|water|malt|wine|vodka|gin|tonic)\b/.test(
      name,
    )
  if (beverageHint) {
    options.add('crate')
    options.add('bottle')
    options.add('pack')
    options.add('pcs')
  }
  if (['pack', 'pcs', 'sachet', 'tin'].includes(base)) {
    options.add('pack')
    options.add('pcs')
    options.add('sachet')
    options.add('tin')
  }

  return [...options].sort()
}
