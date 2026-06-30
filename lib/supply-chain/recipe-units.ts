/** Parse qty + unit from recipe text like "300ml vegetable oil" or "1kg rice". */
export type ParsedRecipeQty = {
  quantity: number
  unit: string
  raw: string
}

const UNIT_ALIASES: Record<string, string> = {
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  litres: 'l',
  litre: 'l',
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
  can: 'can',
  cans: 'can',
  bottle: 'bottle',
  bottles: 'bottle',
  sachet: 'sachet',
  sachets: 'sachet',
  ball: 'ball',
  balls: 'ball',
  head: 'head',
  heads: 'head',
  set: 'set',
  sets: 'set',
  basket: 'basket',
  leather: 'leather',
  portion: 'portion',
  portions: 'portion',
  roll: 'roll',
  rolls: 'roll',
  pac: 'pack',
  pack: 'pack',
  cooking_spoon: 'cooking_spoon',
  'cooking spoon': 'cooking_spoon',
  'cooking spoons': 'cooking_spoon',
  spoon: 'spoon',
  spoons: 'spoon',
}

/** Convert store unit qty to recipe display unit for costing (best-effort). */
export function convertQtyBetweenUnits(
  qty: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const f = fromUnit.trim().toLowerCase()
  const t = toUnit.trim().toLowerCase()
  if (f === t) return qty
  if ((f === 'l' || f === 'liter' || f === 'litre') && t === 'ml') return qty * 1000
  if (f === 'ml' && (t === 'l' || t === 'liter' || t === 'litre')) return qty / 1000
  if (f === 'kg' && t === 'g') return qty * 1000
  if (f === 'g' && t === 'kg') return qty / 1000
  return null
}

export function parseRecipeQuantity(text: string): ParsedRecipeQty | null {
  const raw = text.trim()
  const m = raw.match(
    /^(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s*(kg|g|ml|l|ltr|litre|liter|mudu|cups?|cooking\s+spoons?|tbsp|tsp|pcs?|pieces?|tin|tins|can|cans|bottle|bottles|sachet|sachets|ball|balls|head|heads|set|sets|basket|leather|portion|portions|pac|pack|spoon|spoons|rolls?|)?/i,
  )
  if (!m) return null
  const numPart = m[1].replace(/\s*[-–]\s*\d+.*/, '')
  const quantity = Number(numPart)
  if (!Number.isFinite(quantity)) return null
  const unitRaw = (m[2] ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const unit = UNIT_ALIASES[unitRaw] ?? (unitRaw || 'unit')
  return { quantity, unit, raw }
}

/** Cost for a material line given store price per store unit. */
export function materialLineCost(
  recipeQty: number,
  recipeUnit: string,
  storeUnit: string,
  storeUnitPrice: number,
): number {
  const converted = convertQtyBetweenUnits(recipeQty, recipeUnit, storeUnit)
  const qtyInStoreUnits = converted ?? recipeQty
  return Math.round(qtyInStoreUnits * storeUnitPrice * 100) / 100
}
