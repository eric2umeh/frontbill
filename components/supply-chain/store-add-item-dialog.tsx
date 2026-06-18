'use client'

import { useRef, useState } from 'react'
import {
  DEPT_LABELS,
  KITCHEN_MATERIAL_CATEGORIES,
  KITCHEN_MATERIAL_CATEGORY_LABELS,
  normalizeStoreItemDepts,
  STORE_DEPT_PICKER_OPTIONS,
  type SupplyDept,
  type KitchenMaterialCategory,
} from '@/lib/supply-chain/types'
import { titleCaseWhileTyping, toTitleCaseWords } from '@/lib/supply-chain/title-case'
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
import { parseCsvText } from '@/lib/supply-chain/parse-csv-row'
import { toast } from 'sonner'
import { Plus, Upload } from 'lucide-react'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { DEFAULT_MEASUREMENT_UNIT, sanitizeQuantityInput } from '@/lib/supply-chain/measurement-units'
import { StoreDeptMultiSelect } from '@/components/supply-chain/store-dept-multi-select'
import { unitFactorDefinition } from '@/lib/supply-chain/unit-factor-storage'
import type { UnitFactorMap } from '@/lib/supply-chain/unit-factor-types'

type Dept = Exclude<SupplyDept, 'all'>
const CONVERSION_UNITS = ['pack', 'carton', 'bag', 'roll', 'crate', 'tin', 'can', 'bottle', 'pcs'] as const

type Props = {
  canAddDirect: boolean
  canSubmit: boolean
  onAddDirect: (input: {
    name: string
    unit: string
    dept: Dept
    depts?: Dept[]
    quantityInStore: number
    reorderLevel: number
    lastPrice: number
    benchmarkPrice: number
    kitchenCategory?: KitchenMaterialCategory
    unitFactors?: UnitFactorMap
  }) => { ok: true } | { error: string }
  onSubmitForApproval: (input: {
    name: string
    unit: string
    dept: Dept
    depts?: Dept[]
    quantityInStore: number
    reorderLevel: number
    lastPrice: number
    benchmarkPrice: number
    kitchenCategory?: KitchenMaterialCategory
    unitFactors?: UnitFactorMap
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
  const [unit, setUnit] = useState<string>(DEFAULT_MEASUREMENT_UNIT)
  const [depts, setDepts] = useState<Dept[]>([])
  const [qty, setQty] = useState('')
  const [reorder, setReorder] = useState('')
  const [price, setPrice] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [kitchenCategory, setKitchenCategory] = useState<KitchenMaterialCategory>('other')
  const [conversionUnit, setConversionUnit] = useState('pack')
  const [conversionQty, setConversionQty] = useState('')
  const [csvBusy, setCsvBusy] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setName('')
    setUnit(DEFAULT_MEASUREMENT_UNIT)
    setDepts([])
    setQty('')
    setReorder('')
    setPrice('')
    setBenchmark('')
    setKitchenCategory('other')
    setConversionUnit('pack')
    setConversionQty('')
  }

  const buildInput = () => {
    const normalized = normalizeStoreItemDepts(depts)
    const conversionDef = unitFactorDefinition(unit, conversionUnit)
    const conversionCount = Number(conversionQty)
    const unitFactors =
      conversionDef && Number.isFinite(conversionCount) && conversionCount > 0
        ? { [conversionDef.storageKey]: conversionCount }
        : undefined
    return {
      name: toTitleCaseWords(name),
      unit: unit.trim(),
      dept: normalized.dept,
      depts: normalized.depts,
      quantityInStore: Number(qty) || 0,
      reorderLevel: Number(reorder) || 0,
      lastPrice: Number(price) || 0,
      benchmarkPrice: Number(benchmark) || Number(price) || 0,
      kitchenCategory: depts.includes('kitchen') ? kitchenCategory : undefined,
      unitFactors,
    }
  }
  const conversionDef = unitFactorDefinition(unit, conversionUnit)

  const parseNumberOrNull = (raw: string | undefined): number | null => {
    const t = (raw ?? '').trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  const parseKitchenCategory = (raw: string): KitchenMaterialCategory | null => {
    const t = raw.trim().toLowerCase()
    if (!t) return null
    for (const c of KITCHEN_MATERIAL_CATEGORIES) {
      if (c.toLowerCase() === t) return c
      if (KITCHEN_MATERIAL_CATEGORY_LABELS[c].toLowerCase() === t) return c
    }
    return null
  }

  const deptKeyByLabel = new Map(
    STORE_DEPT_PICKER_OPTIONS.map((d) => [DEPT_LABELS[d].toLowerCase(), d]),
  )
  const allowedDeptKeys = new Set(STORE_DEPT_PICKER_OPTIONS)

  const parseDeptParts = (raw: string, rowNo: number): Dept[] | null => {
    const parts = raw
      .split(/[|;]+/g)
      .map((p) => p.trim())
      .filter(Boolean)
    if (!parts.length) return null

    const out: Dept[] = []
    for (const p of parts) {
      const pl = p.toLowerCase()
      const key = pl === 'bar' ? 'main_bar' : (pl as Dept)
      if (allowedDeptKeys.has(key as any)) {
        out.push(key as Dept)
        continue
      }
      const byLabel = deptKeyByLabel.get(pl)
      if (byLabel) {
        out.push(byLabel)
        continue
      }
      toast.error(`Row ${rowNo}: Unknown department "${p}"`)
      return null
    }
    return [...new Set(out)]
  }

  const headerKey = (s: string) =>
    s
      .trim()
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/_/g, '')
      .replace(/-/g, '')

  const indexOf = (header: string[], keys: string[]): number => {
    const map = new Map(header.map((h, i) => [headerKey(h), i]))
    for (const k of keys) {
      const idx = map.get(headerKey(k))
      if (idx != null) return idx
    }
    return -1
  }

  const normalizeCell = (raw: string | undefined) =>
    (raw ?? '').replace(/\u00a0/g, ' ').trim()

  const handleCsvUpload = async (file: File) => {
    if (csvBusy) return
    setCsvBusy(true)
    try {
      const text = await file.text()
      const rows = parseCsvText(text)
      if (rows.length < 2) {
        toast.error('CSV is empty')
        return
      }

      const [header, ...dataRows] = rows
      if (!dataRows.length) {
        toast.error('CSV has headers but no rows')
        return
      }

      const nameIdx = indexOf(header, [
        'name',
        'names',
        'item',
        'itemname',
        'product',
        'productname',
        'description',
        'material',
      ])
      const unitIdx = indexOf(header, ['unit', 'uom', 'siunit'])
      const deptIdx = indexOf(header, ['dept', 'department'])
      const deptsIdx = indexOf(header, ['depts', 'departments'])
      const qtyIdx = indexOf(header, [
        'quantityInStore',
        'qtyInStore',
        'quantityOnHand',
        'qtyOnHand',
        'quantity',
        'qty',
      ])
      const reorderIdx = indexOf(header, ['reorderLevel', 'reorder'])
      const lastPriceIdx = indexOf(header, [
        'lastPrice',
        'lastprice',
        'price',
        'unitPrice',
        'unitprice',
      ])
      const benchmarkIdx = indexOf(header, ['benchmarkPrice', 'benchmark'])
      const kitchenCategoryIdx = indexOf(header, ['kitchenCategory', 'kitchencategory'])
      const conversionUnitIdx = indexOf(header, [
        'conversionUnit',
        'packUnit',
        'containerUnit',
        'purchaseUnit',
      ])
      const conversionQtyIdx = indexOf(header, [
        'conversionQty',
        'qtyPerPack',
        'pcsPerPack',
        'piecesPerPack',
        'contentsPerPack',
        'unitsPerPack',
      ])

      if (nameIdx < 0) {
        toast.error(
          `CSV missing name column (use "name" or "names"). Found: ${header.filter(Boolean).slice(0, 8).join(', ') || '(none)'}`,
        )
        return
      }

      const inputs: Parameters<typeof onAddDirect>[0][] = []

      dataRows.forEach((cells, i) => {
        const rowNo = i + 2 // header is row 1
        const rawName = normalizeCell(cells[nameIdx])
        const rawUnit = unitIdx >= 0 ? normalizeCell(cells[unitIdx]) : ''
        const rawQty = qtyIdx >= 0 ? normalizeCell(cells[qtyIdx]) : ''
        const rawReorder = reorderIdx >= 0 ? normalizeCell(cells[reorderIdx]) : ''
        const rawLast = lastPriceIdx >= 0 ? normalizeCell(cells[lastPriceIdx]) : ''
        const rawBenchmark = benchmarkIdx >= 0 ? normalizeCell(cells[benchmarkIdx]) : ''
        const rawKitchenCategory =
          kitchenCategoryIdx >= 0 ? normalizeCell(cells[kitchenCategoryIdx]) : ''
        const rawConversionUnit =
          conversionUnitIdx >= 0 ? normalizeCell(cells[conversionUnitIdx]) : ''
        const rawConversionQty =
          conversionQtyIdx >= 0 ? normalizeCell(cells[conversionQtyIdx]) : ''

        if (!rawName) return

        const partsRaw =
          deptsIdx >= 0
            ? normalizeCell(cells[deptsIdx])
            : deptIdx >= 0
              ? normalizeCell(cells[deptIdx])
              : ''
        let parsedDepts: Dept[]
        if (partsRaw) {
          const parsed = parseDeptParts(partsRaw, rowNo)
          if (!parsed?.length) return
          parsedDepts = parsed
        } else {
          toast.error(`Row ${rowNo}: dept required — add a dept or depts column`)
          return
        }

        const qtyN = parseNumberOrNull(rawQty) ?? 0
        const reorderN = parseNumberOrNull(rawReorder) ?? 0
        const lastPriceN = parseNumberOrNull(rawLast) ?? 0
        const benchN = parseNumberOrNull(rawBenchmark) ?? lastPriceN

        const kitchenCat =
          parsedDepts.includes('kitchen') && rawKitchenCategory?.trim()
            ? parseKitchenCategory(rawKitchenCategory) ?? null
            : null
        if (parsedDepts.includes('kitchen') && rawKitchenCategory?.trim() && !kitchenCat) {
          toast.error(`Row ${rowNo}: Invalid kitchenCategory`)
          return
        }

        const normalized = normalizeStoreItemDepts(parsedDepts)
        const rowUnit = (rawUnit || DEFAULT_MEASUREMENT_UNIT).trim()
        const conversionDef = rawConversionUnit
          ? unitFactorDefinition(rowUnit, rawConversionUnit)
          : null
        const conversionCount = parseNumberOrNull(rawConversionQty)
        const unitFactors =
          conversionDef && conversionCount != null && conversionCount > 0
            ? { [conversionDef.storageKey]: conversionCount }
            : undefined
        inputs.push({
          name: toTitleCaseWords(rawName),
          unit: rowUnit,
          dept: normalized.dept as Dept,
          depts: normalized.depts as Dept[] | undefined,
          quantityInStore: qtyN,
          reorderLevel: reorderN,
          lastPrice: lastPriceN,
          benchmarkPrice: benchN,
          kitchenCategory: parsedDepts.includes('kitchen')
            ? (kitchenCat ?? 'other')
            : undefined,
          unitFactors,
        })
      })

      if (!inputs.length) {
        toast.error('No valid rows found in CSV')
        return
      }

      let okCount = 0
      let errCount = 0
      for (const input of inputs) {
        const res = canAddDirect ? onAddDirect(input) : onSubmitForApproval(input as any)
        if ('error' in res) {
          errCount++
          toast.error(res.error)
        } else {
          okCount++
        }
      }

      toast.success(`CSV import complete: ${okCount} added${errCount ? `, ${errCount} failed` : ''}`)
      reset()
      setOpen(false)
    } finally {
      setCsvBusy(false)
    }
  }

  if (!canAddDirect && !canSubmit) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Add central store item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Item name *</Label>
            <Input
              className="mt-0.5"
              value={name}
              onChange={(e) => setName(titleCaseWhileTyping(e.target.value))}
              placeholder="Hypo Bleach, Rice, Milk…"
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
          <div className="sm:col-span-2 rounded-md border border-dashed bg-muted/20 p-2">
            <Label className="text-xs">Pack / issue conversion (optional)</Label>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Use this for accountable buying and issuing. Example: 1 pack = 9 pcs.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select value={conversionUnit} onValueChange={setConversionUnit}>
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONVERSION_UNITS.map((u) => (
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
              placeholder="Same as price if empty"
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
          <div className="sm:col-span-2">
            <Label className="text-xs">Bulk add via CSV (optional)</Label>
            <div className="mt-0.5">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={csvBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  void handleCsvUpload(f)
                  e.currentTarget.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={csvBusy}
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {csvBusy ? 'Uploading…' : 'Choose CSV file'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 break-words">
              Columns: name or names, unit, depts/dept (required — e.g. Kitchen, Main Bar,
              Restaurant), quantityInStore, reorderLevel, lastPrice or UNIT PRICE. Optional:
              benchmarkPrice, kitchenCategory, conversionUnit, qtyPerPack.
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canAddDirect ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                if (!depts.length) {
                  toast.error('Select at least one department')
                  return
                }
                const res = onAddDirect(buildInput())
                if ('error' in res) {
                  toast.error(res.error)
                  return
                }
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
                if (!depts.length) {
                  toast.error('Select at least one department')
                  return
                }
                const res = onSubmitForApproval(buildInput())
                if ('error' in res) {
                  toast.error(res.error)
                  return
                }
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
