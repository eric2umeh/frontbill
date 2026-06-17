import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'

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
  sellingPrice: number
  overheadLabour: number
  overheadGas: number
  overheadOther: number
  outletMenuSync: BatchOutletMenuSync
}

function headerKey(s: string): string {
  return s
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .replace(/-/g, '')
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

/** Header-based kitchen batch CSV (same rules as Central Store CSV import). */
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
    'item',
    'menu',
    'menuname',
    'dish',
  ])
  const categoryIdx = indexOfHeader(header, [
    'category',
    'menucategory',
    'cat',
    'type',
    'menutype',
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
    'unitprice',
  ])
  const labourIdx = indexOfHeader(header, ['labour', 'labor', 'overheadlabour'])
  const gasIdx = indexOfHeader(header, ['gas', 'overheadgas'])
  const otherIdx = indexOfHeader(header, ['other', 'overheadother', 'overhead'])
  const outletIdx = indexOfHeader(header, ['outlet', 'outletmenusync', 'fnb', 'restaurant'])

  if (nameIdx < 0) {
    return {
      ok: false,
      error: `CSV missing name column (use "name" or "names"). Found: ${header.filter(Boolean).slice(0, 8).join(', ') || '(none)'}`,
    }
  }
  if (categoryIdx < 0) {
    return {
      ok: false,
      error: `CSV missing category column. Found: ${header.filter(Boolean).slice(0, 8).join(', ') || '(none)'}`,
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
