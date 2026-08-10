'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BasketLine, PoLine } from '@/lib/supply-chain/types'
import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS_SORTED,
  normalizeSupplyDept,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PoLinesTable } from '@/components/supply-chain/po-lines-table'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deptHeaderStyle } from '@/lib/supply-chain/dept-styles'

type SharedProps = {
  editable?: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
  pageSize?: number
  compact?: boolean
  showDept?: boolean
  title?: string
  /** External department filter (e.g. from PaginatedListShell). */
  deptFilter?: string
}

type PoProps = SharedProps & {
  kind?: 'po'
  lines: PoLine[]
}

type BasketProps = SharedProps & {
  kind: 'basket'
  lines: BasketLine[]
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
  const present = new Set(
    [...depts].map((d) => normalizeSupplyDept(d)),
  )
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
      dept: normalizeSupplyDept(l.dept),
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
    dept: normalizeSupplyDept(l.dept),
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

  useEffect(() => {
    setPage(1)
  }, [items.length, pageSize])

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
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <PoLinesTable rows={rows} compact={compact} showDept={false} />
      {totalPages > 1 && (
        <div
          className={cn(
            'flex items-center justify-between gap-1 text-muted-foreground',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          <span className="min-w-0 truncate">
            {start + 1}–{Math.min(start + pageSize, items.length)} / {items.length}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(compact ? 'h-7 w-7' : 'h-8 w-8')}
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="tabular-nums px-0.5">
              {safePage}/{totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(compact ? 'h-7 w-7' : 'h-8 w-8')}
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
    deptFilter,
  } = props
  const kind = props.kind ?? 'po'
  const lines = props.lines
  const [search, setSearch] = useState('')
  const [focusDept, setFocusDept] = useState<string>('all')

  useEffect(() => {
    if (deptFilter && deptFilter !== 'all') {
      setFocusDept(normalizeSupplyDept(deptFilter))
    } else if (deptFilter === 'all' || deptFilter === '') {
      setFocusDept('all')
    }
  }, [deptFilter])

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

  const heading = title ?? `Purchase list · ${grandCount} items`
  const externalLocked = Boolean(deptFilter && deptFilter !== 'all')

  return (
    <div className={cn(compact ? 'space-y-2.5' : 'space-y-4')}>
      {!compact && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {heading}
        </p>
      )}

      <div className="rounded-lg border bg-background overflow-hidden">
        <div
          className={cn(
            'border-b bg-muted/40',
            compact ? 'px-2 py-1.5' : 'px-3 py-2',
          )}
        >
          <p
            className={cn(
              'font-semibold text-foreground',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            {compact ? 'By department' : 'Totals by department'}
          </p>
          {!compact && (
            <p className="text-[13px] text-muted-foreground">
              {externalLocked
                ? 'Filtered by the department selector above — only matching lines are listed.'
                : 'Tap a department to focus its items. Tap again (or All) to show every department.'}
            </p>
          )}
        </div>
        <ul className="divide-y">
          {deptSummaries.map((row) => {
            const active = focusDept === row.dept
            const style = deptHeaderStyle(row.dept)
            return (
              <li key={row.dept}>
                <button
                  type="button"
                  disabled={externalLocked && !active}
                  onClick={() => {
                    if (externalLocked) return
                    setFocusDept((prev) => (prev === row.dept ? 'all' : row.dept))
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 text-left transition-colors border-l-4 min-w-0',
                    compact ? 'px-2 py-1.5 text-[13px]' : 'gap-3 px-3 py-2.5 text-[15px]',
                    style.header,
                    active ? 'ring-1 ring-inset ring-foreground/10' : 'opacity-95 hover:opacity-100',
                    externalLocked && !active && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 border truncate max-w-[9rem]',
                        compact ? 'text-[11px] px-1.5 py-0' : 'text-xs',
                        style.badge,
                      )}
                    >
                      {DEPT_LABELS[row.dept]}
                    </Badge>
                    {!compact && (
                      <span className="text-[13px] text-muted-foreground tabular-nums">
                        {row.count} item{row.count === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'font-semibold tabular-nums shrink-0 whitespace-nowrap',
                      compact ? 'text-[13px]' : 'text-[15px]',
                      style.accent,
                    )}
                  >
                    {formatNaira(row.total)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div
          className={cn(
            'flex items-center justify-between gap-2 border-t bg-muted/30 min-w-0',
            compact ? 'px-2 py-1.5' : 'px-3 py-3 gap-3',
          )}
        >
          <div className="min-w-0 overflow-hidden">
            <p
              className={cn(
                'font-semibold truncate',
                compact ? 'text-[13px]' : 'text-[15px]',
              )}
            >
              {focusDept === 'all'
                ? compact
                  ? 'All depts'
                  : 'Sum total — all departments'
                : compact
                  ? DEPT_LABELS[focusDept as SupplyDept] ?? focusDept
                  : `Sum total — ${DEPT_LABELS[focusDept as SupplyDept] ?? focusDept}`}
            </p>
            {!compact && (
              <p className="text-[13px] text-muted-foreground tabular-nums">
                {focusDept === 'all'
                  ? `${grandCount} item${grandCount === 1 ? '' : 's'} across ${deptSummaries.length} department${deptSummaries.length === 1 ? '' : 's'}`
                  : `${filteredGrouped[0]?.items.length ?? 0} item(s) in focus`}
              </p>
            )}
          </div>
          <p
            className={cn(
              'font-bold tabular-nums shrink-0 whitespace-nowrap',
              compact ? 'text-[13px]' : 'text-lg',
            )}
          >
            {formatNaira(
              focusDept === 'all'
                ? grandTotal
                : (filteredGrouped[0]?.total ?? 0),
            )}
          </p>
        </div>
      </div>

      <div className={cn('flex flex-col gap-2', !compact && 'sm:flex-row sm:items-center')}>
        <div className={cn('relative flex-1', !compact && 'max-w-md')}>
          <Search
            className={cn(
              'absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground',
              compact ? 'h-3.5 w-3.5' : 'left-3 h-4 w-4',
            )}
          />
          <Input
            placeholder={compact ? 'Search…' : 'Search items within departments…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(compact ? 'h-8 pl-8 text-[13px]' : 'pl-9 text-[13px]')}
          />
        </div>
        {focusDept !== 'all' && !externalLocked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(compact ? 'h-8 text-[13px]' : 'text-[13px]')}
            onClick={() => setFocusDept('all')}
          >
            {compact ? 'All depts' : 'Show all departments'}
          </Button>
        )}
      </div>

      {filteredGrouped.length === 0 ? (
        <p
          className={cn(
            'text-muted-foreground text-center rounded-md border border-dashed',
            compact ? 'text-[13px] py-4' : 'text-sm py-6',
          )}
        >
          No items match this search or department filter.
        </p>
      ) : (
        <div className={cn(compact ? 'space-y-2' : 'space-y-4')}>
          {filteredGrouped.map((group) => {
            const style = deptHeaderStyle(group.dept)
            return (
              <section
                key={group.dept}
                className={cn(
                  'rounded-lg border overflow-hidden bg-background',
                  style.header,
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-between gap-2 border-b border-inherit min-w-0',
                    compact ? 'px-2 py-1.5' : 'flex-wrap px-3 py-2.5',
                    style.header,
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    <Badge
                      variant="outline"
                      className={cn(
                        'border shrink-0',
                        compact ? 'text-[11px] px-1.5 py-0' : 'text-xs',
                        style.badge,
                      )}
                    >
                      {DEPT_LABELS[group.dept]}
                    </Badge>
                    <span
                      className={cn(
                        'text-muted-foreground tabular-nums shrink-0',
                        compact ? 'text-xs' : 'text-[13px]',
                      )}
                    >
                      {group.items.length}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'font-semibold tabular-nums shrink-0 whitespace-nowrap',
                      compact ? 'text-[13px]' : 'text-[15px]',
                      style.accent,
                    )}
                  >
                    {formatNaira(group.total)}
                  </p>
                </div>
                <div className={cn('bg-background', compact ? 'p-1.5' : 'p-2 sm:p-3')}>
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
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Department filter options for a list of POs (any line matching). */
export function poDepartmentFilterOptions(orders: { lines: PoLine[] }[]) {
  const present = new Set<string>()
  for (const po of orders) {
    for (const l of po.lines) present.add(normalizeSupplyDept(l.dept))
  }
  return deptOptionsFrom(present)
}
