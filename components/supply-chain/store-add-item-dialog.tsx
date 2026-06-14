'use client'

import { useState } from 'react'
import {
  DEPT_LABELS,
  KITCHEN_MATERIAL_CATEGORIES,
  KITCHEN_MATERIAL_CATEGORY_LABELS,
  type KitchenMaterialCategory,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import { toTitleCaseWords } from '@/lib/supply-chain/title-case'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { DEFAULT_MEASUREMENT_UNIT } from '@/lib/supply-chain/measurement-units'

const DEPTS: Exclude<SupplyDept, 'all'>[] = [
  'kitchen',
  'bar',
  'housekeeping',
  'maintenance',
  'front_office',
  'laundry',
]

type Props = {
  canAddDirect: boolean
  canSubmit: boolean
  onAddDirect: (input: {
    name: string
    unit: string
    dept: Exclude<SupplyDept, 'all'>
    quantityInStore: number
    reorderLevel: number
    lastPrice: number
    benchmarkPrice: number
    kitchenCategory?: KitchenMaterialCategory
  }) => { ok: true } | { error: string }
  onSubmitForApproval: (input: {
    name: string
    unit: string
    dept: Exclude<SupplyDept, 'all'>
    quantityInStore: number
    reorderLevel: number
    lastPrice: number
    benchmarkPrice: number
    kitchenCategory?: KitchenMaterialCategory
  }) => { ok: true } | { error: string }
}

export function StoreAddItemDialog({
  canAddDirect,
  canSubmit,
  onAddDirect,
  onSubmitForApproval,
}: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState(DEFAULT_MEASUREMENT_UNIT)
  const [dept, setDept] = useState<Exclude<SupplyDept, 'all'>>('kitchen')
  const [qty, setQty] = useState('')
  const [reorder, setReorder] = useState('')
  const [price, setPrice] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [kitchenCategory, setKitchenCategory] = useState<KitchenMaterialCategory>('other')

  const reset = () => {
    setName('')
    setUnit(DEFAULT_MEASUREMENT_UNIT)
    setDept('kitchen')
    setQty('')
    setReorder('')
    setPrice('')
    setBenchmark('')
    setKitchenCategory('other')
  }

  const buildInput = () => ({
    name: toTitleCaseWords(name),
    unit: unit.trim(),
    dept,
    quantityInStore: Number(qty) || 0,
    reorderLevel: Number(reorder) || 0,
    lastPrice: Number(price) || 0,
    benchmarkPrice: Number(benchmark) || Number(price) || 0,
    kitchenCategory: dept === 'kitchen' ? kitchenCategory : undefined,
  })

  if (!canAddDirect && !canSubmit) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add central store item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Item name *</Label>
            <Input
              className="mt-0.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName(toTitleCaseWords(name))}
              placeholder="Rice, Coke, Detergent…"
            />
          </div>
          <div>
            <Label className="text-xs">Unit of measure *</Label>
            <div className="mt-0.5">
              <UnitSelect value={unit} onChange={setUnit} className="w-full h-9" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Price below is per this unit (e.g. ₦10,000 / kg).
            </p>
          </div>
          <div>
            <Label className="text-xs">Dept *</Label>
            <Select value={dept} onValueChange={(v) => setDept(v as typeof dept)}>
              <SelectTrigger className="mt-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPT_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">In store qty</Label>
            <Input
              inputMode="decimal"
              className="mt-0.5"
              placeholder="—"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Reorder level</Label>
            <Input
              inputMode="decimal"
              className="mt-0.5"
              placeholder="—"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Price (₦) *</Label>
            <Input
              type="number"
              min={0}
              className="mt-0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Benchmark (₦)</Label>
            <Input
              type="number"
              min={0}
              className="mt-0.5"
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
              placeholder="Same as price if empty"
            />
          </div>
          {dept === 'kitchen' && (
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
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canAddDirect ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                const res = onAddDirect(buildInput())
                if ('error' in res) return
                reset()
                setOpen(false)
              }}
            >
              Add to store
            </Button>
          ) : (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                const res = onSubmitForApproval(buildInput())
                if ('error' in res) return
                reset()
                setOpen(false)
              }}
            >
              Submit for approval
            </Button>
          )}
        </DialogFooter>
        {!canAddDirect && (
          <p className="text-xs text-muted-foreground">
            Submissions require Admin or Superadmin approval before appearing in stock.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
