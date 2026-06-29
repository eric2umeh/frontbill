import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'
import type { BatchMaterialLine, KitchenStockItem, StoreItem } from '@/lib/supply-chain/types'
import { parseRecipeQuantity } from '@/lib/supply-chain/recipe-units'

/** Strip UTF-8 BOM Excel often adds to the first cell. */
export function stripCsvBom(text: string): string {
  return text.replace(/^\uFEFF/, '')
}

/** Pick the delimiter that splits the header into the most columns. */
export function detectCsvDelimiter(line: string): ',' | ';' | '\t' {
  const candidates: Array<',' | ';' | '\t'> = [',', ';', '\t']
  let best: ',' | ';' | '\t' = ','
  let bestCount = 0
  for (const d of candidates) {
    const count = line.split(d).length - 1
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }
  return best
}

/** Parse one CSV row, respecting double-quoted fields with commas. */
export function parseCsvRow(line: string, delimiter = ','): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

export function parseCsvText(text: string): string[][] {
  const cleaned = stripCsvBom(text)
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return []
  const delimiter = detectCsvDelimiter(lines[0])
  return lines.map((l) => parseCsvRow(l, delimiter))
}

const HEADER_HINTS = new Set([
  'name',
  'names',
  'batch',
  'batchname',
  'category',
  'portions',
  'sellingprice',
  'price',
  'outlet',
])

export function csvRowsSkipHeader(rows: string[][]): string[][] {
  if (!rows.length) return rows
  const first = rows[0].map((c) => headerKey(c))
  if (first.some((c) => HEADER_HINTS.has(c))) return rows.slice(1)
  return rows
}

export type BatchCsvRow = {
  name: string
  category: string
  portions: number
  yieldUnit?: string
  sellingPrice: number
  overheadLabour: number
  overheadGas: number
  overheadOther: number
  outletMenuSync: BatchOutletMenuSync
  /** Raw ingredient lines from recipe-list CSV (name + store items columns). */
  ingredientLines?: string[]
  ingredientRows?: BatchCsvIngredientRow[]
}

export type BatchCsvIngredientRow = {
  text: string
  source?: 'raw' | 'kitchen_stock'
  optional?: boolean
  lineCost?: number
}

function headerKey(s: string): string {
  return s
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function indexOfHeader(header: string[], keys: string[]): number {
  const map = new Map(header.map((h, i) => [headerKey(h), i]))
  for (const k of keys) {
    const idx = map.get(headerKey(k))
    if (idx != null) return idx
  }
  return -1
}

function normalizeCell(raw: string | undefined): string {
  return (raw ?? '').replace(/\u00a0/g, ' ').trim()
}

function parseNumberOrZero(raw: string | undefined): number {
  const t = normalizeCell(raw)
  if (!t) return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

function parseOutletColumn(raw: string | undefined): BatchOutletMenuSync {
  const v = normalizeCell(raw).toLowerCase()
  if (!v || v === '0' || v === 'none' || v === 'off') return 'none'
  if (v === '2' || v === 'fnb' || v === 'restaurantfnb' || v === 'restaurant/f&b') {
    return 'restaurant_fnb'
  }
  if (v === '1' || v === 'true' || v === 'yes' || v === 'restaurant') {
    return 'restaurant'
  }
  return 'none'
}

function parseBooleanCell(raw: string | undefined): boolean {
  const v = normalizeCell(raw).toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'optional'
}

function parseIngredientSource(raw: string | undefined): 'raw' | 'kitchen_stock' {
  const v = normalizeCell(raw).toLowerCase().replace(/[\s_-]+/g, '')
  if (v === 'prep' || v === 'subrecipe' || v === 'kitchenstock' || v === 'produced') {
    return 'kitchen_stock'
  }
  return 'raw'
}

function parsePortionsFromRecipeName(name: string): number {
  const patterns = [
    /(\d+)\s*persons?\b/i,
    /(\d+)\s*portions?\b/i,
    /for\s*(\d+)\s*person/i,
    /recipe\s*(\d+)/i,
    /\(?\s*(\d+)\s*portion/i,
    /(\d+)\s*pcs?\)/i,
  ]
  for (const pattern of patterns) {
    const match = name.match(pattern)
    if (match?.[1]) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return 10
}

function inferCategoryFromRecipeName(name: string): string {
  const n = name.toLowerCase()
  if (/salad|coleslaw|cole slaw|fruit salad/.test(n)) return 'Salads'
  if (/soup|pepper soup|egusi|okro|ogbono|bitter leaf|vegetable soup/.test(n)) return 'Soups'
  if (/pasta|spaghetti|bolonese|bolognese/.test(n)) return 'Pasta'
  if (/rice|jollof|fried rice|party rice|chinese fried|buttered rice/.test(n)) return 'Rice'
  if (/sauce|liver|fish sauce/.test(n)) return 'Sauces'
  return 'Mains'
}

function looksLikeRecipeTitle(text: string): boolean {
  const t = text.trim()
  if (t.length < 10) return false
  if (/^[\d,.#₦]/.test(t)) return false
  return /recipe|for\s+\d+\s*person|\d+\s*portion|jollof|spaghetti|soup|salad|sauce|rice|pasta/i.test(
    t,
  )
}

/** Recipe list CSV: name + store items (multi-row ingredients per recipe). */
function parseKitchenRecipeListCsvText(
  header: string[],
  dataRows: string[][],
  nameIdx: number,
  itemsIdx: number,
  categoryIdx = -1,
  portionsIdx = -1,
  priceIdx = -1,
  yieldUnitIdx = -1,
  labourIdx = -1,
  gasIdx = -1,
  otherIdx = -1,
  outletIdx = -1,
  ingredientSourceIdx = -1,
  optionalIdx = -1,
  lineCostIdx = -1,
): { ok: true; rows: BatchCsvRow[] } | { ok: false; error: string } {
  const out: BatchCsvRow[] = []
  let active: BatchCsvRow | undefined

  const startRecipe = (rawName: string, cells: string[] = []) => {
    const name = normalizeCell(rawName)
    if (!name) return
    const category = categoryIdx >= 0 ? normalizeCell(cells[categoryIdx]) : ''
    const portions = portionsIdx >= 0 ? parseNumberOrZero(cells[portionsIdx]) : 0
    active = {
      name,
      category: category || inferCategoryFromRecipeName(name),
      portions: portions > 0 ? portions : parsePortionsFromRecipeName(name),
      yieldUnit: yieldUnitIdx >= 0 ? normalizeCell(cells[yieldUnitIdx]) || 'portion' : 'portion',
      sellingPrice: priceIdx >= 0 ? parseNumberOrZero(cells[priceIdx]) : 0,
      overheadLabour: labourIdx >= 0 ? parseNumberOrZero(cells[labourIdx]) : 0,
      overheadGas: gasIdx >= 0 ? parseNumberOrZero(cells[gasIdx]) : 0,
      overheadOther: otherIdx >= 0 ? parseNumberOrZero(cells[otherIdx]) : 0,
      outletMenuSync: outletIdx >= 0 ? parseOutletColumn(cells[outletIdx]) : 'none',
      ingredientLines: [],
      ingredientRows: [],
    }
    out.push(active)
  }

  const pushIngredient = (cells: string[], rawItem: string) => {
    if (!active || !rawItem) return
    const source = ingredientSourceIdx >= 0 ? parseIngredientSource(cells[ingredientSourceIdx]) : 'raw'
    const optional = optionalIdx >= 0 ? parseBooleanCell(cells[optionalIdx]) : false
    const lineCost = lineCostIdx >= 0 ? parseNumberOrZero(cells[lineCostIdx]) : 0
    active.ingredientLines!.push(rawItem)
    active.ingredientRows!.push({
      text: rawItem,
      source,
      optional,
      lineCost: lineCost > 0 ? lineCost : undefined,
    })
  }

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const rowNo = i + 2
    const rawName = normalizeCell(cells[nameIdx])
    const rawItem = normalizeCell(cells[itemsIdx])

    if (rawName) {
      startRecipe(rawName, cells)
      if (rawItem && !looksLikeRecipeTitle(rawItem) && active) {
        pushIngredient(cells, rawItem)
      } else if (rawItem && looksLikeRecipeTitle(rawItem)) {
        startRecipe(rawItem, cells)
      }
      continue
    }

    if (!rawItem) continue

    if (looksLikeRecipeTitle(rawItem)) {
      startRecipe(rawItem, cells)
      continue
    }

    if (!active) {
      return {
        ok: false,
        error: `Row ${rowNo}: ingredient line before any recipe name — add a name in the first column`,
      }
    }
    pushIngredient(cells, rawItem)
  }

  if (!out.length) {
    return { ok: false, error: 'No valid recipes found in CSV' }
  }

  return { ok: true, rows: out }
}

/** Header-based kitchen batch CSV (standard columns or recipe-list format). */
export function parseKitchenBatchCsvText(
  text: string,
): { ok: true; rows: BatchCsvRow[] } | { ok: false; error: string } {
  const rows = parseCsvText(text)
  if (rows.length < 2) {
    return { ok: false, error: 'CSV is empty' }
  }

  const [header, ...dataRows] = rows
  if (!dataRows.length) {
    return { ok: false, error: 'CSV has headers but no rows' }
  }

  const nameIdx = indexOfHeader(header, [
    'name',
    'names',
    'batch',
    'batchname',
    'batchmenuname',
    'item',
    'menu',
    'menuname',
    'dish',
    'recipe',
  ])
  const categoryIdx = indexOfHeader(header, [
    'category',
    'maincategory',
    'menucategory',
    'cat',
    'type',
    'menutype',
  ])
  const itemsIdx = indexOfHeader(header, [
    'storeitems',
    'storeitem',
    'ingredients',
    'ingredient',
    'materials',
    'items',
    'itemlist',
  ])

  const portionsIdx = indexOfHeader(header, [
    'portions',
    'plannedportions',
    'yield',
    'yieldportions',
    'qty',
    'quantity',
  ])
  const priceIdx = indexOfHeader(header, [
    'price',
    'sellingprice',
    'sellingpriceperportion',
    'sellingpriceportion',
    'unitprice',
  ])
  const labourIdx = indexOfHeader(header, ['labour', 'labor', 'overheadlabour'])
  const gasIdx = indexOfHeader(header, ['gas', 'overheadgas'])
  const otherIdx = indexOfHeader(header, ['other', 'overheadother', 'overhead'])
  const outletIdx = indexOfHeader(header, ['outlet', 'outletmenusync', 'fnb', 'restaurant'])
  const yieldUnitIdx = indexOfHeader(header, ['yieldunit', 'plannedunit', 'productionunit'])
  const ingredientSourceIdx = indexOfHeader(header, [
    'ingredientsource',
    'source',
    'stocksource',
  ])
  const optionalIdx = indexOfHeader(header, ['optional', 'isoptional'])
  const lineCostIdx = indexOfHeader(header, ['linecost', 'cost', 'ingredientcost'])

  if (nameIdx < 0) {
    return {
      ok: false,
      error: `CSV missing name column (use "name" or "names"). Found: ${header.filter(Boolean).slice(0, 8).join(', ') || '(none)'}`,
    }
  }

  const hasContinuationRows =
    itemsIdx >= 0 &&
    dataRows.some((cells) => !normalizeCell(cells[nameIdx]) && normalizeCell(cells[itemsIdx]))

  // Recipe list: one recipe name row followed by ingredient rows in the store items column.
  if (itemsIdx >= 0 && (categoryIdx < 0 || hasContinuationRows)) {
    return parseKitchenRecipeListCsvText(
      header,
      dataRows,
      nameIdx,
      itemsIdx,
      categoryIdx,
      portionsIdx,
      priceIdx,
      yieldUnitIdx,
      labourIdx,
      gasIdx,
      otherIdx,
      outletIdx,
      ingredientSourceIdx,
      optionalIdx,
      lineCostIdx,
    )
  }

  if (categoryIdx < 0) {
    return {
      ok: false,
      error: `CSV needs a category column, or use recipe-list format: name + store items. Found: ${header.filter(Boolean).slice(0, 8).join(', ') || '(none)'}`,
    }
  }

  const out: BatchCsvRow[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const rowNo = i + 2
    const name = normalizeCell(cells[nameIdx])
    const category = normalizeCell(cells[categoryIdx])
    if (!name) continue
    if (!category) {
      return { ok: false, error: `Row ${rowNo}: category is required` }
    }

    const portions = portionsIdx >= 0 ? parseNumberOrZero(cells[portionsIdx]) : 0
    if (portions <= 0) {
      return { ok: false, error: `Row ${rowNo}: enter valid portions for "${name}"` }
    }

    out.push({
      name,
      category,
      portions,
      yieldUnit: yieldUnitIdx >= 0 ? normalizeCell(cells[yieldUnitIdx]) || 'portion' : 'portion',
      sellingPrice: priceIdx >= 0 ? parseNumberOrZero(cells[priceIdx]) : 0,
      overheadLabour: labourIdx >= 0 ? parseNumberOrZero(cells[labourIdx]) : 0,
      overheadGas: gasIdx >= 0 ? parseNumberOrZero(cells[gasIdx]) : 0,
      overheadOther: otherIdx >= 0 ? parseNumberOrZero(cells[otherIdx]) : 0,
      outletMenuSync: outletIdx >= 0 ? parseOutletColumn(cells[outletIdx]) : 'none',
    })
  }

  if (!out.length) {
    return { ok: false, error: 'No valid rows found in CSV' }
  }

  return { ok: true, rows: out }
}

/** Positional fallback: name, category, portions, price, labour, gas, other, outlet. */
export function batchRowFromCsvCells(cells: string[]): BatchCsvRow | null {
  if (cells.length < 2) return null
  const name = normalizeCell(cells[0])
  const category = normalizeCell(cells[1])
  if (!name || !category) return null
  const portions = parseNumberOrZero(cells[2])
  if (portions <= 0) return null
  return {
    name,
    category,
    portions,
    sellingPrice: parseNumberOrZero(cells[3]),
    overheadLabour: parseNumberOrZero(cells[4]),
    overheadGas: parseNumberOrZero(cells[5]),
    overheadOther: parseNumberOrZero(cells[6]),
    outletMenuSync: parseOutletColumn(cells[7]),
  }
}

function parseFractionToken(raw: string): number | null {
  const t = raw.trim()
  if (t === '½') return 0.5
  if (t === '¼') return 0.25
  if (t === '¾') return 0.75
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function parseIngredientQuantity(line: string): number {
  const m = line.trim().match(/^([½¼¾]|\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)\s*/)
  if (!m?.[1]) return 1
  if (m[1].includes('/')) {
    const [a, b] = m[1].split('/').map((x) => Number(x.trim()))
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b
  }
  return parseFractionToken(m[1]) ?? 1
}

function matchKitchenStoreItem(
  ingredientLine: string,
  kitchenItems: Pick<StoreItem, 'id' | 'name' | 'dept' | 'lastPrice' | 'unit'>[],
): Pick<StoreItem, 'id' | 'name' | 'dept' | 'lastPrice' | 'unit'> | undefined {
  const lower = ingredientLine.toLowerCase()
  let best: (typeof kitchenItems)[number] | undefined
  let bestLen = 0
  for (const item of kitchenItems) {
    const name = item.name.toLowerCase()
    if (name.length >= 3 && lower.includes(name) && name.length > bestLen) {
      best = item
      bestLen = name.length
    }
  }
  if (best) return best
  for (const item of kitchenItems) {
    const tokens = item.name.toLowerCase().split(/\s+/).filter((t) => t.length > 3)
    if (tokens.some((t) => lower.includes(t)) && item.name.length > bestLen) {
      best = item
      bestLen = item.name.length
    }
  }
  return best
}

/** Map free-text ingredient lines to batch material rows (links central store when names match). */
export function mapIngredientLinesToMaterials(
  lines: string[],
  storeItems: Pick<StoreItem, 'id' | 'name' | 'dept' | 'lastPrice' | 'unit'>[],
): BatchMaterialLine[] {
  const kitchenItems = storeItems.filter((s) => s.dept === 'kitchen')
  const out: BatchMaterialLine[] = []
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const matched = matchKitchenStoreItem(trimmed, kitchenItems)
    const quantity = parseIngredientQuantity(trimmed)
    if (matched) {
      out.push({
        storeItemId: matched.id,
        name: matched.name,
        unit: matched.unit,
        quantity,
        unitCost: matched.lastPrice ?? 0,
      })
    } else {
      out.push({
        storeItemId: `csv-ing-${i}`,
        name: trimmed.slice(0, 120),
        unit: 'unit',
        quantity,
        unitCost: 0,
      })
    }
  })
  return out
}

function matchKitchenStockItem(
  ingredientLine: string,
  kitchenStockItems: Pick<KitchenStockItem, 'id' | 'name' | 'availablePortions' | 'unit'>[],
): Pick<KitchenStockItem, 'id' | 'name' | 'availablePortions' | 'unit'> | undefined {
  const lower = ingredientLine.toLowerCase()
  return kitchenStockItems.find((item) => lower.includes(item.name.toLowerCase()))
}

export function mapIngredientRowsToMaterials(
  rows: BatchCsvIngredientRow[],
  storeItems: Pick<StoreItem, 'id' | 'name' | 'dept' | 'lastPrice' | 'unit'>[],
  kitchenStockItems: Pick<KitchenStockItem, 'id' | 'name' | 'availablePortions' | 'unit'>[] = [],
): BatchMaterialLine[] {
  return rows.map((row, i) => {
    const parsed = parseRecipeQuantity(row.text)
    const quantity = parsed?.quantity ?? parseIngredientQuantity(row.text)
    const parsedUnit = parsed?.unit && parsed.unit !== 'unit' ? parsed.unit : ''

    if (row.source === 'kitchen_stock') {
      const matched = matchKitchenStockItem(row.text, kitchenStockItems)
      return {
        storeItemId: matched?.id ?? `csv-prep-${i}`,
        name: matched?.name ?? row.text.slice(0, 120),
        unit: parsedUnit || matched?.unit || 'portion',
        quantity,
        unitCost: row.lineCost && quantity > 0 ? row.lineCost / quantity : 0,
        source: 'kitchen_stock',
        optional: row.optional,
        lineCost: row.lineCost,
      }
    }

    const matched = matchKitchenStoreItem(row.text, storeItems.filter((s) => s.dept === 'kitchen'))
    return {
      storeItemId: matched?.id ?? `csv-ing-${i}`,
      name: matched?.name ?? row.text.slice(0, 120),
      unit: parsedUnit || matched?.unit || 'unit',
      quantity,
      unitCost: matched?.lastPrice ?? (row.lineCost && quantity > 0 ? row.lineCost / quantity : 0),
      source: 'raw',
      optional: row.optional,
      lineCost: row.lineCost,
    }
  })
}
