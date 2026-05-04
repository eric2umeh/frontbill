#!/usr/bin/env node
/**
 * Parses scripts/data/monthly-report-store-september.csv (monthly stock layout)
 * and prints SQL for scripts/030_store_monthly_report_seed.sql
 *
 * Usage: node scripts/generate-store-monthly-seed.mjs > scripts/030_store_monthly_report_seed.sql
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH = path.join(__dirname, 'data/monthly-report-store-september.csv')

function splitCsvRow(line) {
  return line.split(',').map((s) => s.trim())
}

function escapeSql(s) {
  return String(s).replace(/'/g, "''")
}

const HEADER_HINTS = new Set([
  'DEY ITEMS',
  'QTY AT HAND',
  'PER UNIT',
  'UNIT PRICE',
  'AMOUNT',
  'CLOSING STOCK VALUE',
  'REMARK',
])

function normalizeName(s) {
  return s.replace(/`/g, "'").replace(/\s+/g, ' ').trim()
}

function parseQtyUnit(col2, col3) {
  const c2 = (col2 || '').trim()
  const c3 = (col3 || '').trim()
  const combined = `${c2} ${c3}`.trim()
  const m = combined.match(/^(\d+(?:\.\d+)?)\s+(.+)$/i)
  if (m) {
    return { qty: parseFloat(m[1]), unit: normalizeUnit(m[2]) }
  }
  if (c2 && /^(kg|pcs|pack|mud|btts|l|litr|can|rm|packs)$/i.test(c2)) {
    return { qty: 0, unit: normalizeUnit(c2) }
  }
  if (c3 && /^(kg|pcs|pack|mud|btts|l|litr|can|rm|packs)$/i.test(c3)) {
    return { qty: 0, unit: normalizeUnit(c3) }
  }
  const m2 = c2.match(/^(\d+(?:\.\d+)?)\s+(.+)$/i)
  if (m2) {
    return { qty: parseFloat(m2[1]), unit: normalizeUnit(m2[2]) }
  }
  return { qty: 0, unit: c2 ? normalizeUnit(c2) : 'pcs' }
}

function normalizeUnit(u) {
  const x = (u || 'pcs').toLowerCase().trim()
  if (x === 'litr') return 'l'
  if (x === 'packs') return 'pack'
  return x || 'pcs'
}

function matchSection(labelRaw) {
  const u = labelRaw.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
  if (!u) return null
  if (u.includes('GENERAL STORE')) return 'general-store'
  if (u.includes('HOUSEKEEPING') || u.includes('LAUNDRY DEPARTMENT')) return 'housekeeping-laundry'
  if (u.includes('STAFF MEAL')) return 'staff-meal'
  if (u.includes('STATIONERIES')) return 'stationeries'
  if (u.includes('KITCHEN CONSUMAB')) return 'kitchen-consumable'
  if (u === 'RESTAURANT' || (u.includes('RESTAURANT') && u.length < 18)) return 'restaurant'
  if (u.includes('MAIN BAR WINE')) return 'main-bar-wine'
  if (u.includes('BEERS') && u.includes('SOFT')) return 'main-bar-beers-soft'
  if (u.includes('MAIN BAR') && u.length < 22 && !u.includes('WINE')) return null
  if (u.includes('BEVERAGES STORE')) return 'beverages-store'
  if (u.includes('F ') && u.includes('B') && u.includes('INVENTOR')) return 'fb-inventory'
  return null
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const lines = raw.split(/\r?\n/)

  let currentSlug = 'general-store'
  /** @type {{ catSlug: string, name: string, unit: string, qty: number }[]} */
  const items = []
  const seen = new Set()

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo]
    if (lineNo > 276) break
    if (!line.trim()) continue

    const cells = splitCsvRow(line)
    const raw0 = (cells[0] || '').trim()
    const raw1 = (cells[1] || '').trim()
    const c2 = (cells[2] || '').trim()
    const c3 = (cells[3] || '').trim()

    const label = normalizeName(raw1 || raw0)
    const headerHit = HEADER_HINTS.has(label.toUpperCase())
    if (headerHit) continue

    const secSlug = matchSection(label)
    if (secSlug) {
      currentSlug = secSlug
      continue
    }

    // Section header row that does not return a slug (e.g. "MAIN BAR" before beers block)
    if (/^MAIN BAR$/i.test(label)) continue

    const isNumFirst = /^\d+$/.test(raw0)
    const name = normalizeName(isNumFirst ? raw1 : raw1 || raw0)
    if (!name || name.length < 2) continue

    // Skip lingering section-like junk
    if (matchSection(name)) continue

    let qty = 0
    let unit = 'pcs'
    if (currentSlug === 'fb-inventory') {
      const p = parseQtyUnit(c2, c3)
      qty = p.qty
      unit = p.unit
    } else {
      const p = parseQtyUnit(c2, c3)
      qty = p.qty
      unit = p.unit
    }

    const key = `${currentSlug}::${name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    items.push({ catSlug: currentSlug, name, unit, qty })
  }

  const categories = [
    { slug: 'general-store', name: 'General Store', order: 10 },
    { slug: 'housekeeping-laundry', name: 'Housekeeping / Laundry', order: 20 },
    { slug: 'staff-meal', name: 'Staff Meal (Food)', order: 30 },
    { slug: 'stationeries', name: 'Stationeries', order: 40 },
    { slug: 'kitchen-consumable', name: 'Kitchen consumable', order: 50 },
    { slug: 'restaurant', name: 'Restaurant', order: 60 },
    { slug: 'main-bar-wine', name: 'Main Bar — Wine', order: 70 },
    { slug: 'main-bar-beers-soft', name: 'Main Bar — Beers & Soft Drinks', order: 80 },
    { slug: 'beverages-store', name: 'Beverages Store', order: 90 },
    { slug: 'fb-inventory', name: 'F & B inventory (crockery)', order: 100 },
  ]

  const out = []
  out.push(`-- Auto-generated by scripts/generate-store-monthly-seed.mjs`)
  out.push(`-- Source: scripts/data/monthly-report-store-september.csv`)
  out.push(`-- Run in Supabase SQL Editor AFTER 029_store_inventory.sql`)
  out.push(`--`)
  out.push(
    `-- Edit ONLY the uuid in DECLARE below: put your organizations.id between the quotes (valid UUID format).`
  )
  out.push(`-- Example: org_id uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;`)
  out.push(`DO $$`)
  out.push(`DECLARE`)
  out.push(`  org_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;`)
  out.push(`BEGIN`)
  out.push(``)
  out.push(`  INSERT INTO public.store_categories (organization_id, name, slug, sort_order)`)
  out.push(`  SELECT org_id, v.name, v.slug, v.ord`)
  out.push(`  FROM (`)
  out.push(
    `    VALUES\n${categories.map((c) => `      ('${escapeSql(c.name)}', '${c.slug}', ${c.order})`).join(',\n')}`
  )
  out.push(`  ) AS v(name, slug, ord)`)
  out.push(`  ON CONFLICT (organization_id, slug) DO NOTHING;`)
  out.push(``)

  const valueLines = items.map(
    (it) =>
      `      ('${escapeSql(it.name)}', '${it.catSlug}', '${escapeSql(it.unit)}', ${it.qty})`
  )
  out.push(`  INSERT INTO public.store_items (`)
  out.push(`    organization_id, category_id, name, unit, quantity_on_hand, reorder_level, unit_price, is_active`)
  out.push(`  )`)
  out.push(`  SELECT`)
  out.push(`    org_id,`)
  out.push(`    c.id,`)
  out.push(`    v.name::text,`)
  out.push(`    v.u::text,`)
  out.push(`    GREATEST(0, v.qty::numeric),`)
  out.push(`    0,`)
  out.push(`    0,`)
  out.push(`    true`)
  out.push(`  FROM (`)
  out.push(`    VALUES`)
  out.push(valueLines.join(',\n'))
  out.push(`  ) AS v(name, catslug, u, qty)`)
  out.push(`  JOIN public.store_categories c`)
  out.push(`    ON c.organization_id = org_id AND c.slug = v.catslug;`)
  out.push(``)
  out.push(`END $$;`)
  out.push(``)
  out.push(`-- ${items.length} line items across ${categories.length} categories.`)

  process.stdout.write(out.join('\n') + '\n')
  console.error(`Wrote ${items.length} items, ${categories.length} categories`)
}

main()
