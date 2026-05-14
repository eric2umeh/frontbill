import type { StoreItemRow } from '@/lib/store/types'

export type ParsedBulkLine = { lineNo: number; key: string; qty: number }

/** Split pasted text into key + quantity lines (tab, comma, or pipe separator). */
export function parseBulkStockLines(text: string): ParsedBulkLine[] {
  const out: ParsedBulkLine[] = []
  const lines = text.split(/\r?\n/)
  let lineNo = 0
  for (const raw of lines) {
    lineNo += 1
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    let keyPart = ''
    let qtyPart = ''

    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean)
      if (parts.length < 2) continue
      qtyPart = parts[parts.length - 1]!
      keyPart = parts.slice(0, -1).join('\t').trim()
    } else if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim()).filter(Boolean)
      if (parts.length < 2) continue
      qtyPart = parts[parts.length - 1]!
      keyPart = parts.slice(0, -1).join('|').trim()
    } else {
      const lastComma = line.lastIndexOf(',')
      if (lastComma <= 0) continue
      keyPart = line.slice(0, lastComma).trim()
      qtyPart = line.slice(lastComma + 1).trim()
    }

    const qty = Number(String(qtyPart).replace(/,/g, '.'))
    if (!keyPart || !Number.isFinite(qty) || qty <= 0) continue
    out.push({ lineNo, key: keyPart, qty })
  }
  return out
}

export type ResolveBulkItemResult =
  | { ok: true; item: StoreItemRow }
  | { ok: false; reason: string }

/** Match by SKU (case-insensitive), then exact name, then unique case-insensitive name. */
export function resolveBulkItemKey(key: string, items: StoreItemRow[]): ResolveBulkItemResult {
  const k = key.trim()
  if (!k) return { ok: false, reason: 'Empty key' }

  const skuHits = items.filter((i) => (i.sku || '').trim().toLowerCase() === k.toLowerCase())
  if (skuHits.length === 1) return { ok: true, item: skuHits[0]! }
  if (skuHits.length > 1) return { ok: false, reason: `Multiple items share SKU "${k}"` }

  const exactName = items.filter((i) => i.name.trim() === k)
  if (exactName.length === 1) return { ok: true, item: exactName[0]! }

  const ci = items.filter((i) => i.name.trim().toLowerCase() === k.toLowerCase())
  if (ci.length === 1) return { ok: true, item: ci[0]! }
  if (ci.length > 1) return { ok: false, reason: `Multiple items match name "${k}"` }

  return { ok: false, reason: `No item found for "${k}" (use SKU or exact name)` }
}
