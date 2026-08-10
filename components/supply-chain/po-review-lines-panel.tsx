'use client'

import { useMemo } from 'react'
import type { BasketLine, PoLine } from '@/lib/supply-chain/types'
import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS_SORTED,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { PoLinesTable } from '@/components/supply-chain/po-lines-table'

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

function deptOptionsFrom(depts: Iterable<string>) {
  const present = new Set(depts)
  return STORE_DEPT_PICKER_OPTIONS_SORTED.filter((d) => present.has(d)).map((d) => ({
    value: d,
    label: DEPT_LABELS[d as SupplyDept] ?? d,
  }))
}

export function PoReviewLinesPanel(props: Props) {
  const {
    editable = false,
    onQtyChange,
    onDelete,
    pageSize = 10,
    compact = false,
    showDept = true,
    title,
  } = props
  const kind = props.kind ?? 'po'
  const lines = props.lines

  const deptsInList = useMemo(() => {
    if (kind === 'basket') {
      return deptOptionsFrom((lines as BasketLine[]).map((l) => l.dept))
    }
    return deptOptionsFrom((lines as PoLine[]).map((l) => l.dept))
  }, [kind, lines])

  const filters = useMemo(
    () => [
      {
        key: 'dept',
        label: 'Department',
        options: deptsInList,
      },
    ],
    [deptsInList],
  )

  const total = useMemo(() => {
    if (kind === 'basket') {
      return (lines as BasketLine[]).reduce((s, l) => s + l.qtyToBuy * l.unitPrice, 0)
    }
    return (lines as PoLine[]).reduce((s, l) => s + l.lineTotal, 0)
  }, [kind, lines])

  if (!lines.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No line items.</p>
    )
  }

  const heading =
    title ?? `Purchase list (${lines.length} items · ${formatNaira(total)})`

  if (kind === 'basket') {
    const basketLines = lines as BasketLine[]
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {heading}
        </p>
        <PaginatedListShell
          items={basketLines}
          pageSize={pageSize}
          searchPlaceholder="Search items by name or unit…"
          searchMatch={(line, query) => {
            const q = query.trim().toLowerCase()
            if (!q) return true
            return (
              line.name.toLowerCase().includes(q) ||
              line.unit.toLowerCase().includes(q) ||
              (DEPT_LABELS[line.dept] ?? line.dept).toLowerCase().includes(q)
            )
          }}
          filters={filters}
          filterMatch={(line, key, value) => {
            if (key !== 'dept') return undefined
            if (!value || value === 'all') return true
            return line.dept === value
          }}
          emptyMessage="No items match this search or department filter."
        >
          {(pageItems) => (
            <PoLinesTable
              rows={pageItems.map((line) => ({
                kind: 'basket' as const,
                line,
                editable,
                onQtyChange: editable ? onQtyChange : undefined,
                onDelete: editable ? onDelete : undefined,
              }))}
              compact={compact}
              showDept={showDept}
            />
          )}
        </PaginatedListShell>
      </div>
    )
  }

  const poLines = lines as PoLine[]
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {heading}
      </p>
      <PaginatedListShell
        items={poLines}
        pageSize={pageSize}
        searchPlaceholder="Search items by name or unit…"
        searchMatch={(line, query) => {
          const q = query.trim().toLowerCase()
          if (!q) return true
          return (
            line.name.toLowerCase().includes(q) ||
            line.unit.toLowerCase().includes(q) ||
            (DEPT_LABELS[line.dept] ?? line.dept).toLowerCase().includes(q)
          )
        }}
        filters={filters}
        filterMatch={(line, key, value) => {
          if (key !== 'dept') return undefined
          if (!value || value === 'all') return true
          return line.dept === value
        }}
        emptyMessage="No items match this search or department filter."
      >
        {(pageItems) => (
          <PoLinesTable
            rows={pageItems.map((line) => ({
              kind: 'po' as const,
              line,
              editable,
              onQtyChange: editable ? onQtyChange : undefined,
              onDelete: editable ? onDelete : undefined,
            }))}
            compact={compact}
            showDept={showDept}
          />
        )}
      </PaginatedListShell>
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
