'use client'

import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { canonicalRoleKey } from '@/lib/permissions'
import {
  mapIngredientLinesToMaterials,
  parseKitchenBatchCsvText,
} from '@/lib/supply-chain/parse-csv-row'
import {
  shouldSyncBatchToOutlet,
} from '@/lib/supply-chain/batch-outlet-sync'
import { syncBatchToRestaurantOutlet } from '@/lib/supply-chain/sync-restaurant-outlet'

type Props = {
  /** compact = icon button in page header; default = outline button */
  variant?: 'compact' | 'default'
  onComplete?: () => void
}

const RECIPE_LIST_SAMPLE = `batch / menu name,store items,main category,Planned portions,Selling price / portion (_)
Jollof Rice 1kg,Rice = 1kg,Rice,6,2500
,Vegetable oil = 300ml,,,
,Tomato paste = 200g,,,
,Onion = 2 pcs,,,
,Salt to taste,,,
Fried Rice 1kg,Rice = 1kg,Rice,6,3000
,Chicken stock = 1 litre,,,
,Mixed vegetables = 500g,,,
,Curry powder = 1 tbsp,,,`

const STANDARD_BATCH_SAMPLE = `name,category,portions,price,labour,gas,other,outlet
Jollof Rice 1kg,Rice,6,2500,500,300,200,restaurant
Fried Rice 1kg,Rice,6,3000,500,300,200,restaurant`

function downloadSampleCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function KitchenBatchCsvUpload({ variant = 'default', onComplete }: Props) {
  const { name, role } = useAuth()
  const { storeItems, openKitchenBatchFromMaterials } = useSupplyChain()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const roleKey = canonicalRoleKey(role) ?? ''
  const canUpload = roleKey === 'superadmin' || roleKey === 'admin' || roleKey === 'manager'
  if (!canUpload) return null

  const actor = { name: name ?? 'Kitchen', role: roleKey || 'staff' }

  const handleFile = async (file: File) => {
    if (busy) return
    setBusy(true)
    try {
      const text = await file.text()
      const parsed = parseKitchenBatchCsvText(text)
      if (!parsed.ok) {
        toast.error(parsed.error)
        return
      }

      let okCount = 0
      let errCount = 0
      let matchedIngredients = 0
      let totalIngredients = 0

      for (const row of parsed.rows) {
        const materials = row.ingredientLines?.length
          ? mapIngredientLinesToMaterials(row.ingredientLines, storeItems)
          : []
        totalIngredients += materials.length
        matchedIngredients += materials.filter((m) => !m.storeItemId.startsWith('csv-ing-')).length

        const res = openKitchenBatchFromMaterials(
          {
            batchName: row.name,
            menuCategory: row.category,
            plannedPortions: row.portions,
            sellingPricePerPortion: row.sellingPrice,
            materials,
            overheadLabour: row.overheadLabour,
            overheadGas: row.overheadGas,
            overheadOther: row.overheadOther,
            outletMenuSync: row.outletMenuSync,
          },
          actor,
        )
        if ('error' in res) {
          errCount++
          toast.error(`${row.name}: ${res.error}`)
          continue
        }
        if (shouldSyncBatchToOutlet(row.outletMenuSync)) {
          const sync = await syncBatchToRestaurantOutlet({
            batchName: row.name,
            categoryName: row.category,
            unitPrice: row.sellingPrice,
            kitchenStockId: res.kitchenStockId,
            outletMenuSync: row.outletMenuSync,
          })
          if (!sync.ok) {
            toast.warning(`${row.name}: saved but Restaurant sync failed — ${sync.error}`)
          }
        }
        okCount++
      }

      if (!okCount) {
        toast.error('No batch standards were imported')
        return
      }

      const ingredientNote =
        totalIngredients > 0
          ? ` (${matchedIngredients}/${totalIngredients} ingredients linked to central store)`
          : ''
      toast.success(
        `CSV import complete: ${okCount} batch standard(s) added${errCount ? `, ${errCount} failed` : ''}${ingredientNote}`,
      )
      setOpen(false)
      onComplete?.()
    } finally {
      setBusy(false)
    }
  }

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={busy}
      onClick={() => setOpen(true)}
    >
      <Upload className="h-4 w-4 mr-2" />
      {busy ? 'Uploading…' : 'Bulk CSV'}
    </Button>
  )

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Bulk upload batch standards (CSV)</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Choose CSV file</Label>
            <div className="mt-0.5">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  void handleFile(f)
                  e.currentTarget.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {busy ? 'Uploading…' : 'Choose CSV file'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 break-words space-y-1">
              <span className="block font-medium text-foreground/80">Recipe list (your format)</span>
              <span className="block">
                Put the recipe name only on the first ingredient row. Leave the recipe-name cell blank for the
                remaining ingredients under the same recipe.
              </span>
            </p>
            <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Demo recipe-list CSV</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => downloadSampleCsv('kitchen-recipe-list-sample.csv', RECIPE_LIST_SAMPLE)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px] leading-relaxed">
                {RECIPE_LIST_SAMPLE}
              </pre>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 break-words space-y-1">
              <span className="block font-medium text-foreground/80">Or standard format</span>
              <span className="block">
                Use one row per menu/batch standard when you do not need ingredient lines.
              </span>
            </p>
            <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Demo standard CSV</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => downloadSampleCsv('kitchen-batch-standard-sample.csv', STANDARD_BATCH_SAMPLE)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px] leading-relaxed">
                {STANDARD_BATCH_SAMPLE}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
