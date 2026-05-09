import type { StoreCategoryRow, StoreItemRow, MovementRow } from '@/lib/store/types'

export type MonthlyMovementAgg = {
  qtyIn: number
  qtyOut: number
  valueOut: number
}

/** Aggregate movements in a period; valueOut uses current unit price map (est.). */
export function aggregateMonthlyMovements(
  movements: MovementRow[],
  unitPriceByItemId: Map<string, number>,
): Map<string, MonthlyMovementAgg> {
  const m = new Map<string, MonthlyMovementAgg>()
  const bump = (id: string) => {
    if (!m.has(id)) m.set(id, { qtyIn: 0, qtyOut: 0, valueOut: 0 })
    return m.get(id)!
  }
  for (const row of movements) {
    const id = row.item_id
    const price = Number(unitPriceByItemId.get(id) ?? 0)
    const q = Number(row.quantity)
    const rec = bump(id)
    const t = row.movement_type
    if (t === 'in') {
      rec.qtyIn += Math.abs(q)
    } else if (t === 'out' || t === 'issue' || t === 'sale') {
      const absq = Math.abs(q)
      rec.qtyOut += absq
      rec.valueOut += absq * price
    }
  }
  return m
}

export type MonthlyReportLine = {
  item: StoreItemRow
  qtyOnHand: number
  unitPrice: number
  stockValue: number
  monthQtyIn: number
  monthQtyOut: number
  monthValueOut: number
}

export type MonthlyReportSection = {
  category: StoreCategoryRow | null
  title: string
  lines: MonthlyReportLine[]
  subtotalStockValue: number
  subtotalMonthOutValue: number
}

function itemIncludedInReport(it: StoreItemRow, agg: Map<string, MonthlyMovementAgg>): boolean {
  if (it.is_active) return true
  const a = agg.get(it.id)
  return !!(a && (a.qtyIn > 0 || a.qtyOut > 0))
}

export function buildMonthlyReportSections(
  categories: StoreCategoryRow[],
  items: StoreItemRow[],
  agg: Map<string, MonthlyMovementAgg>,
): MonthlyReportSection[] {
  const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const byCatId = new Map<string, StoreItemRow[]>()
  for (const c of sortedCats) byCatId.set(c.id, [])
  const uncategorized: StoreItemRow[] = []

  for (const it of items) {
    if (!itemIncludedInReport(it, agg)) continue
    if (it.category_id && byCatId.has(it.category_id)) {
      byCatId.get(it.category_id)!.push(it)
    } else {
      uncategorized.push(it)
    }
  }

  const toLine = (it: StoreItemRow): MonthlyReportLine => {
    const q = Number(it.quantity_on_hand)
    const p = Number(it.unit_price || 0)
    const a = agg.get(it.id)
    return {
      item: it,
      qtyOnHand: q,
      unitPrice: p,
      stockValue: q * p,
      monthQtyIn: a?.qtyIn ?? 0,
      monthQtyOut: a?.qtyOut ?? 0,
      monthValueOut: a?.valueOut ?? 0,
    }
  }

  const sections: MonthlyReportSection[] = []

  for (const c of sortedCats) {
    const list = (byCatId.get(c.id) || []).sort((a, b) => a.name.localeCompare(b.name))
    if (list.length === 0) continue
    const lines = list.map(toLine)
    sections.push({
      category: c,
      title: c.name,
      lines,
      subtotalStockValue: lines.reduce((s, l) => s + l.stockValue, 0),
      subtotalMonthOutValue: lines.reduce((s, l) => s + l.monthValueOut, 0),
    })
  }

  if (uncategorized.length > 0) {
    const lines = uncategorized.sort((a, b) => a.name.localeCompare(b.name)).map(toLine)
    sections.push({
      category: null,
      title: 'Uncategorized',
      lines,
      subtotalStockValue: lines.reduce((s, l) => s + l.stockValue, 0),
      subtotalMonthOutValue: lines.reduce((s, l) => s + l.monthValueOut, 0),
    })
  }

  return sections
}

export function reportMonthLabel(ym: string): string {
  const [y, mo] = ym.split('-').map(Number)
  if (!y || !mo) return ym
  const d = new Date(y, mo - 1, 1)
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}
