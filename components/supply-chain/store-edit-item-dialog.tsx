'use client'

import { useEffect, useState } from 'react'
import {
  KITCHEN_MATERIAL_CATEGORIES,
  KITCHEN_MATERIAL_CATEGORY_LABELS,
  normalizeStoreItemDepts,
  sanitizeAssignableStoreDepts,
  storeItemDepartments,
  type KitchenMaterialCategory,
  type StoreItem,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import { titleCaseWhileTyping, toTitleCaseWords } from '@/lib/supply-chain/title-case'
import { formatUnitLabel, sanitizeQuantityInput } from '@/lib/supply-chain/measurement-units'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { StoreDeptMultiSelect } from '@/components/supply-chain/store-dept-multi-select'
import { unitFactorDefinition } from '@/lib/supply-chain/unit-factor-storage'
import type { UnitFactorMap } from '@/lib/supply-chain/unit-factor-types'
import { storeUnitPriceFromEntryPrice, purchaseUnitPriceFromStorePrice } from '@/lib/supply-chain/purchase-unit-pricing'
import { PURCHASE_CONVERSION_UNITS } from '@/lib/supply-chain/conversion-units'

type Dept = Exclude<SupplyDept, 'all'>

type Props = {
  item: StoreItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: {
    name: string
    unit: string
    dept: Dept
    depts?: Dept[]
    reorderLevel: number
    lastPrice: number
    benchmarkPrice: number
    quantityInStore?: number
    kitchenCategory?: KitchenMaterialCategory
    unitFactors?: UnitFactorMap
  }) => { ok: true } | { error: string }
}

const numberInputValue = (value: number | null | undefined) =>
  value != null && Number(value) !== 0 ? String(value) : ''

export function StoreEditItemDialog({ item, open, onOpenChange, onSave }: Props) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('kg')
  const [depts, setDepts] = useState<Dept[]>(['kitchen'])
  const [reorder, setReorder] = useState('')
  const [price, setPrice] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [qty, setQty] = useState('')
  const [kitchenCategory, setKitchenCategory] = useState<KitchenMaterialCategory>('other')
  const [conversionUnit, setConversionUnit] = useState('pack')
  const [conversionQty, setConversionQty] = useState('')

  useEffect(() => {
    if (!item || !open) return
    setName(item.name)
    setUnit(item.unit)
    setDepts(storeItemDepartments(item))
    setReorder(numberInputValue(item.reorderLevel))
    setQty(numberInputValue(item.quantityInStore))
    setKitchenCategory(item.kitchenCategory ?? 'other')
    const savedFactor = Object.entries(item.unitFactors ?? {})[0]
    let convUnit = 'pack'
    let convQty = ''
    if (savedFactor) {
      const [key, value] = savedFactor
      convUnit = key.startsWith('__per_') ? key.replace('__per_', '') : key
      convQty = numberInputValue(value)
      setConversionUnit(convUnit)
      setConversionQty(convQty)
    } else {
      setConversionUnit('pack')
      setConversionQty('')
    }
    const def = unitFactorDefinition(item.unit, convUnit)
    const factors = item.unitFactors
    const displayPrice =
      factors && def && convQty
        ? purchaseUnitPriceFromStorePrice(item.lastPrice, convUnit, item.unit, factors)
        : item.lastPrice
    const displayBenchmark =
      factors && def && convQty
        ? purchaseUnitPriceFromStorePrice(item.benchmarkPrice, convUnit, item.unit, factors)
        : item.benchmarkPrice
    setPrice(numberInputValue(displayPrice))
    setBenchmark(numberInputValue(displayBenchmark))
  }, [item, open])

  if (!item) return null
  const conversionDef = unitFactorDefinition(unit, conversionUnit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit store item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Item name *</Label>
            <Input
              className="mt-0.5"
              value={name}
              onChange={(e) => setName(titleCaseWhileTyping(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Unit of measure *</Label>
            <div className="mt-0.5">
              <UnitSelect value={unit} onChange={setUnit} className="w-full h-9" />
            </div>
          </div>
          <div className="sm:col-span-2 rounded-md border border-dashed bg-muted/20 p-2">
            <Label className="text-xs">Purchase conversion (optional)</Label>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Use this for accountable buying and issuing. Example: 1 pack = 9 pcs.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select value={conversionUnit} onValueChange={setConversionUnit}>
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURCHASE_CONVERSION_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs">{conversionDef?.label ?? 'No conversion needed'}</span>
              <Input
                inputMode="decimal"
                className="h-8 w-24 text-center"
                placeholder="Qty"
                value={conversionQty}
                onChange={(e) => setConversionQty(sanitizeQuantityInput(e.target.value))}
                disabled={!conversionDef}
              />
              <span className="text-xs">{conversionDef?.suffix ?? ''}</span>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Departments *</Label>
            <StoreDeptMultiSelect
              className="mt-0.5"
              value={depts}
              onChange={setDepts}
            />
          </div>
          <div>
            <Label className="text-xs">In store qty</Label>
            <Input
              inputMode="decimal"
              className="mt-0.5"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Shared across all selected departments ({formatUnitLabel(unit)}).
            </p>
          </div>
          <div>
            <Label className="text-xs">Reorder level</Label>
            <Input
              inputMode="decimal"
              className="mt-0.5"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Price (₦) *</Label>
            <Input
              inputMode="decimal"
              className="mt-0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Benchmark (₦)</Label>
            <Input
              inputMode="decimal"
              className="mt-0.5"
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
            />
          </div>
          {depts.includes('kitchen') && (
            <div className="sm:col-span-2">
              <Label className="text-xs">Kitchen category</Label>
              <Select
                value={kitchenCategory}
                onValueChange={(v) => setKitchenCategory(v as KitchenMaterialCategory)}
              >
                <SelectTrigger className="mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KITCHEN_MATERIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {KITCHEN_MATERIAL_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const selected = sanitizeAssignableStoreDepts(depts)
              if (!selected.length) return
              const normalized = normalizeStoreItemDepts(selected)
              const conversionCount = Number(conversionQty)
              const unitFactors =
                conversionDef && Number.isFinite(conversionCount) && conversionCount > 0
                  ? { [conversionDef.storageKey]: conversionCount }
                  : undefined
              const rawPrice = Number(price) || 0
              const lastPrice =
                unitFactors && conversionDef
                  ? storeUnitPriceFromEntryPrice(rawPrice, unit.trim(), conversionUnit, unitFactors)
                  : rawPrice
              const rawBenchmark = Number(benchmark) || rawPrice
              const benchmarkPrice =
                unitFactors && conversionDef
                  ? storeUnitPriceFromEntryPrice(rawBenchmark, unit.trim(), conversionUnit, unitFactors)
                  : rawBenchmark || lastPrice
              const res = onSave({
                name: toTitleCaseWords(name),
                unit: unit.trim(),
                dept: normalized.dept,
                depts: normalized.depts ?? [normalized.dept],
                reorderLevel: Number(reorder) || 0,
                lastPrice,
                benchmarkPrice,
                quantityInStore: Math.max(0, Number(qty) || 0),
                kitchenCategory: selected.includes('kitchen') ? kitchenCategory : undefined,
                unitFactors,
              })
              if ('error' in res) return
              onOpenChange(false)
            }}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
