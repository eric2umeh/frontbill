'use client'

import { useMemo, useState } from 'react'
import type { BasketLine, PoLine } from '@/lib/supply-chain/types'
import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS_SORTED,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PoLinesTable } from '@/components/supply-chain/po-lines-table'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type PoProps = {
  kind?: 'po'
  lines: PoLine[]
  editable?: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
  pageSize?: number
  compact?: boolean
  showDept?: boolean
  title?: string
}

type BasketProps = {
  kind: 'basket'
  lines: BasketLine[]
  editable?: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
  pageSize?: number
  compact?: boolean
  showDept?: boolean
  title?: string
}

type Props = PoProps | BasketProps

type NormalizedLine = {
  key: string
  stockItemId: string
  name: string
  dept: Exclude<SupplyDept, 'all'>
  unit: string
  qty: number
  unitPrice: number
  lineTotal: number
  poLine?: PoLine
  basketLine?: BasketLine
}

function deptOptionsFrom(depts: Iterable<string>) {
  const present = new Set(depts)
  return STORE_DEPT_PICKER_OPTIONS_SORTED.filter((d) => present.has(d)).map((d) => ({
    value: d,
    label: DEPT_LABELS[d as SupplyDept] ?? d,
  }))
}

function normalizeLines(kind: 'po' | 'basket', lines: PoLine[] | BasketLine[]): NormalizedLine[] {
  if (kind === 'basket') {
    return (lines as BasketLine[]).map((l) => ({
      key: l.stockItemId,
      stockItemId: l.stockItemId,
      name: l.name,
      dept: l.dept,
      unit: l.unit,
      qty: l.qtyToBuy,
      unitPrice: l.unitPrice,
      lineTotal: l.qtyToBuy * l.unitPrice,
      basketLine: l,
    }))
  }
  return (lines as PoLine[]).map((l) => ({
    key: l.id,
    stockItemId: l.stockItemId,
    name: l.name,
    dept: l.dept,
    unit: l.unit,
    qty: l.quantityOrdered,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    poLine: l,
  }))
}

function DeptSectionItems({
  kind,
  items,
  editable,
  onQtyChange,
  onDelete,
  compact,
  pageSize,
}: {
  kind: 'po' | 'basket'
  items: NormalizedLine[]
  editable: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
  compact: boolean
  pageSize: number
}) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  const rows =
    kind === 'basket'
      ? pageItems.map((n) => ({
          kind: 'basket' as const,
          line: n.basketLine!,
          editable,
          onQtyChange: editable ? onQtyChange : undefined,
          onDelete: editable ? onDelete : undefined,
        }))
      : pageItems.map((n) => ({
          kind: 'po' as const,
          line: n.poLine!,
          editable,
          onQtyChange: editable ? onQtyChange : undefined,
          onDelete: editable ? onDelete : undefined,
        }))

  return (
    <div className="space-y-2">
      <PoLinesTable rows={rows} compact={compact} showDept={false} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {start + 1}–{Math.min(start + pageSize, items.length)} of {items.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="tabular-nums px-1">
              {safePage}/{totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PoReviewLinesPanel(props: Props) {
  const {
    editable = false,
    onQtyChange,
    onDelete,
    pageSize = 10,
    compact = false,
    title,
  } = props
  const kind = props.kind ?? 'po'
  const lines = props.lines
  const [search, setSearch] = useState('')
  const [focusDept, setFocusDept] = useState<string>('all')

  const normalized = useMemo(
    () => normalizeLines(kind, lines as PoLine[] | BasketLine[]),
    [kind, lines],
  )

  const deptSummaries = useMemo(() => {
    const map = new Map<
      Exclude<SupplyDept, 'all'>,
      { dept: Exclude<SupplyDept, 'all'>; total: number; count: number }
    >()
    for (const line of normalized) {
      const cur = map.get(line.dept) ?? { dept: line.dept, total: 0, count: 0 }
      cur.total += line.lineTotal
      cur.count += 1
      map.set(line.dept, cur)
    }
    return STORE_DEPT_PICKER_OPTIONS_SORTED.filter((d) => map.has(d)).map(
      (d) => map.get(d)!,
    )
  }, [normalized])

  const grandTotal = useMemo(
    () => deptSummaries.reduce((s, d) => s + d.total, 0),
    [deptSummaries],
  )
  const grandCount = normalized.length

  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matched = normalized.filter((line) => {
      if (focusDept !== 'all' && line.dept !== focusDept) return false
      if (!q) return true
      return (
        line.name.toLowerCase().includes(q) ||
        line.unit.toLowerCase().includes(q) ||
        (DEPT_LABELS[line.dept] ?? line.dept).toLowerCase().includes(q)
      )
    })
    const groups: Array<{
      dept: Exclude<SupplyDept, 'all'>
      total: number
      items: NormalizedLine[]
    }> = []
    for (const dept of STORE_DEPT_PICKER_OPTIONS_SORTED) {
      const items = matched.filter((l) => l.dept === dept)
      if (!items.length) continue
      groups.push({
        dept,
        total: items.reduce((s, l) => s + l.lineTotal, 0),
        items,
      })
    }
    return groups
  }, [normalized, search, focusDept])

  if (!lines.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No line items.</p>
    )
  }

  const heading =
    title ?? `Purchase list · ${grandCount} items`

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {heading}
      </p>

      {/* 1. Department totals */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/40">
          <p className="text-xs font-semibold text-foreground">Totals by department</p>
          <p className="text-[11px] text-muted-foreground">
            Tap a department to focus its items. Tap again (or All) to show every department.
          </p>
        </div>
        <ul className="divide-y">
          {deptSummaries.map((row) => {
            const active = focusDept === row.dept
            return (
              <li key={row.dept}>
                <button
                  type="button"
                  onClick={() =>
                    setFocusDept((prev) => (prev === row.dept ? 'all' : row.dept))
                  }
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                    active
                      ? 'bg-primary/10'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant={active ? 'default' : 'outline'}
                      className="text-[10px] shrink-0"
                    >
                      {DEPT_LABELS[row.dept]}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {row.count} item{row.count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums shrink-0">
                    {formatNaira(row.total)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* 2. Grand total */}
        <div className="flex items-center justify-between gap-3 px-3 py-3 border-t bg-muted/30">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Sum total — all departments</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {grandCount} item{grandCount === 1 ? '' : 's'} across {deptSummaries.length}{' '}
              department{deptSummaries.length === 1 ? '' : 's'}
            </p>
          </div>
          <p className="text-base font-bold tabular-nums shrink-0">{formatNaira(grandTotal)}</p>
        </div>
      </div>

      {/* Search + clear focus */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items within departments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {focusDept !== 'all' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFocusDept('all')}
          >
            Show all departments
          </Button>
        )}
      </div>

      {/* 3. Items grouped by department */}
      {filteredGrouped.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center rounded-md border border-dashed">
          No items match this search or department focus.
        </p>
      ) : (
        <div className="space-y-4">
          {filteredGrouped.map((group) => (
            <section
              key={group.dept}
              className="rounded-lg border overflow-hidden bg-background"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-muted/40 border-b">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className="text-[10px]">
                    {DEPT_LABELS[group.dept]}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {group.items.length} item{group.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Department total
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatNaira(group.total)}
                  </p>
                </div>
              </div>
              <div className="p-2 sm:p-3">
                <DeptSectionItems
                  kind={kind}
                  items={group.items}
                  editable={editable}
                  onQtyChange={onQtyChange}
                  onDelete={onDelete}
                  compact={compact}
                  pageSize={pageSize}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/** Department filter options for a list of POs (any line matching). */
export function poDepartmentFilterOptions(orders: { lines: PoLine[] }[]) {
  const present = new Set<string>()
  for (const po of orders) {
    for (const l of po.lines) present.add(l.dept)
  }
  return deptOptionsFrom(present)
}
