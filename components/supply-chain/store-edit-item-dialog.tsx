'use client'

import { useEffect, useState } from 'react'
import {
  DEPT_LABELS,
  KITCHEN_MATERIAL_CATEGORIES,
  KITCHEN_MATERIAL_CATEGORY_LABELS,
  type KitchenMaterialCategory,
  type StoreItem,
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UnitSelect } from '@/components/supply-chain/unit-select'

const DEPTS: Exclude<SupplyDept, 'all'>[] = [
  'kitchen',
  'bar',
  'housekeeping',
  'maintenance',
  'front_office',
  'laundry',
]

type Props = {
  item: StoreItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: {
    name: string
    unit: string
    dept: Exclude<SupplyDept, 'all'>
    reorderLevel: number
    lastPrice: number
    benchmarkPrice: number
    kitchenCategory?: KitchenMaterialCategory
  }) => { ok: true } | { error: string }
}

export function StoreEditItemDialog({ item, open, onOpenChange, onSave }: Props) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('kg')
  const [dept, setDept] = useState<Exclude<SupplyDept, 'all'>>('kitchen')
  const [reorder, setReorder] = useState('')
  const [price, setPrice] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [kitchenCategory, setKitchenCategory] = useState<KitchenMaterialCategory>('other')

  useEffect(() => {
    if (!item || !open) return
    setName(item.name)
    setUnit(item.unit)
    setDept(item.dept)
    setReorder(String(item.reorderLevel))
    setPrice(String(item.lastPrice))
    setBenchmark(String(item.benchmarkPrice))
    setKitchenCategory(item.kitchenCategory ?? 'other')
  }, [item, open])

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit store item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Item name *</Label>
            <Input
              className="mt-0.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName(toTitleCaseWords(name))}
            />
          </div>
          <div>
            <Label className="text-xs">Unit of measure *</Label>
            <div className="mt-0.5">
              <UnitSelect value={unit} onChange={setUnit} className="w-full h-9" />
            </div>
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
            <Input className="mt-0.5 bg-muted" readOnly value={String(item.quantityInStore)} />
            <p className="text-[10px] text-muted-foreground mt-1">
              Adjust via issue-out, purchase receipt, or stock count — not here.
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const res = onSave({
                name: toTitleCaseWords(name),
                unit: unit.trim(),
                dept,
                reorderLevel: Number(reorder) || 0,
                lastPrice: Number(price) || 0,
                benchmarkPrice: Number(benchmark) || Number(price) || 0,
                kitchenCategory: dept === 'kitchen' ? kitchenCategory : undefined,
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
