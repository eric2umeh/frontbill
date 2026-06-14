import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'

/** Parse one CSV row, respecting double-quoted fields with commas. */
export function parseCsvRow(line: string): string[] {
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
    if (ch === ',' && !inQuotes) {
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
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCsvRow)
}

const HEADER_HINTS = new Set([
  'name',
  'batch',
  'batchname',
  'batch name',
  'category',
  'portions',
  'sellingprice',
  'selling price',
  'price',
  'outlet',
])

export function csvRowsSkipHeader(rows: string[][]): string[][] {
  if (!rows.length) return rows
  const first = rows[0].map((c) => c.trim().toLowerCase())
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

function parseOutletColumn(raw: string | undefined): BatchOutletMenuSync {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v || v === '0' || v === 'none' || v === 'off') return 'none'
  if (v === '2' || v === 'fnb' || v === 'restaurant_fnb' || v === 'restaurant / f&b') {
    return 'restaurant_fnb'
  }
  if (v === '1' || v === 'true' || v === 'yes' || v === 'restaurant') {
    return 'restaurant'
  }
  return 'none'
}

export function batchRowFromCsvCells(cells: string[]): BatchCsvRow | null {
  if (cells.length < 2) return null
  const name = cells[0]?.trim()
  const category = cells[1]?.trim()
  if (!name || !category) return null
  const portions = Number(cells[2]) || 0
  const sellingPrice = Number(cells[3]) || 0
  const overheadLabour = Number(cells[4]) || 0
  const overheadGas = Number(cells[5]) || 0
  const overheadOther = Number(cells[6]) || 0
  const outletMenuSync = parseOutletColumn(cells[7])
  return {
    name,
    category,
    portions,
    sellingPrice,
    overheadLabour,
    overheadGas,
    overheadOther,
    outletMenuSync,
  }
}
