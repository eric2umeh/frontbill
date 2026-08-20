'use client'

import { useMemo, useState } from 'react'
import type { StoreItem, SupplyDept } from '@/lib/supply-chain/types'
import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS_SORTED,
  normalizeSupplyDept,
  storeItemDepartments,
  storeItemMatchesDept,
} from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import {
  defaultUnitForStoreItem,
  sanitizeQuantityInput,
  parseQuantityValue,
} from '@/lib/supply-chain/measurement-units'
import { Plus } from 'lucide-react'

export type ExtraStockPick = {
  stockItemId: string
  name: string
  dept: Exclude<SupplyDept, 'all'>
  unit: string
  storeUnit: string
  qty: number
  unitPrice: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeItems: StoreItem[]
  onAdd: (picks: ExtraStockPick[]) => void
}

export function AddExtraStockItemsModal({
  open,
  onOpenChange,
  storeItems,
  onAdd,
}: Props) {
  const [dept, setDept] = useState<SupplyDept>('all')
  const [draftQty, setDraftQty] = useState<Record<string, string>>({})
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    const list =
      dept === 'all'
        ? storeItems
        : storeItems.filter((s) => storeItemMatchesDept(s, dept))
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
    )
  }, [storeItems, dept])

  const selectedCount = Object.values(selected).filter(Boolean).length

  const reset = () => {
    setDraftQty({})
    setDraftPrice({})
    setSelected({})
    setDept('all')
  }

  const handleAdd = () => {
    const picks: ExtraStockPick[] = []
    for (const item of storeItems) {
      if (!selected[item.id]) continue
      const qty = parseQuantityValue(draftQty[item.id] ?? '')
      const price = parseQuantityValue(draftPrice[item.id] ?? String(item.lastPrice))
      if (qty <= 0) continue
      const unit = defaultUnitForStoreItem(item.unit)
      const depts = storeItemDepartments(item)
      picks.push({
        stockItemId: item.id,
        name: item.name,
        dept: depts[0] ?? normalizeSupplyDept(item.dept),
        unit,
        storeUnit: item.unit,
        qty,
        unitPrice: price > 0 ? price : item.lastPrice,
      })
    }
    if (!picks.length) return
    onAdd(picks)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add items not on this PO</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Search the catalogue by department, set qty and price, then add. New lines are marked
            as newly added on the Add to Store page.
          </p>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 pb-2">
          <Button
            type="button"
            size="sm"
            variant={dept === 'all' ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setDept('all')}
          >
            All
          </Button>
          {STORE_DEPT_PICKER_OPTIONS_SORTED.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={dept === d ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setDept(d)}
            >
              {DEPT_LABELS[d]}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <PaginatedListShell
            items={filtered}
            pageSize={8}
            resetKey={dept}
            searchPlaceholder="Search store items…"
            searchKeys={['name']}
            emptyMessage="No catalogue items match."
          >
            {(pageItems) => (
              <div className="space-y-2">
                {pageItems.map((item) => {
                  const on = Boolean(selected[item.id])
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 space-y-2 ${
                        on ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {storeItemDepartments(item)
                              .map((d) => DEPT_LABELS[d])
                              .join(', ')}{' '}
                            · in store {item.quantityInStore} {item.unit}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={on ? 'secondary' : 'outline'}
                          className="h-8 shrink-0 gap-1"
                          onClick={() => {
                            setSelected((m) => ({ ...m, [item.id]: !on }))
                            if (!on) {
                              setDraftQty((m) => ({
                                ...m,
                                [item.id]: m[item.id] ?? '1',
                              }))
                              setDraftPrice((m) => ({
                                ...m,
                                [item.id]: m[item.id] ?? String(item.lastPrice || ''),
                              }))
                            }
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {on ? 'Selected' : 'Select'}
                        </Button>
                      </div>
                      {on ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">Qty</p>
                            <Input
                              inputMode="decimal"
                              className="h-8 tabular-nums"
                              value={draftQty[item.id] ?? ''}
                              onChange={(e) =>
                                setDraftQty((m) => ({
                                  ...m,
                                  [item.id]: sanitizeQuantityInput(e.target.value),
                                }))
                              }
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">
                              Unit price
                            </p>
                            <Input
                              inputMode="decimal"
                              className="h-8 tabular-nums"
                              value={draftPrice[item.id] ?? ''}
                              onChange={(e) =>
                                setDraftPrice((m) => ({
                                  ...m,
                                  [item.id]: sanitizeQuantityInput(e.target.value),
                                }))
                              }
                            />
                          </div>
                          <p className="col-span-2 text-xs text-muted-foreground">
                            Line ≈{' '}
                            {formatNaira(
                              parseQuantityValue(draftQty[item.id] ?? '') *
                                parseQuantityValue(
                                  draftPrice[item.id] ?? String(item.lastPrice),
                                ),
                            )}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </PaginatedListShell>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={selectedCount === 0} onClick={handleAdd}>
            Add {selectedCount > 0 ? `${selectedCount} ` : ''}to Add to Store
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
