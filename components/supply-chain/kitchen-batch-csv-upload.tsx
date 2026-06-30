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
  mapIngredientRowsToMaterials,
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

/** Served from public/templates — same file as docs/frontbill-kitchen-batches-template.csv */
export const KITCHEN_BATCH_CSV_TEMPLATE_PATH = '/templates/frontbill-kitchen-batches-template.csv'
export const KITCHEN_BATCH_CSV_TEMPLATE_FILENAME = 'frontbill-kitchen-batches-template.csv'

const TEMPLATE_PREVIEW = `batch / menu name,store items,main category,planned portions,yield unit,selling price / portion,labour,gas,other,outlet,ingredient source,optional,line cost
Fruit Salad,0.5 pack Watermelon,Salad,10,portion,4000,0,0,0,restaurant,raw,,1000
,0.5 pack Pineapple,,,,,,,,,raw,,750
Bitter Leaf Soup,0.5 pack Bitter Leaf,African Soups,10,portion,5000,0,0,0,none,raw,,750
… (full hotel recipe list in the downloaded template)`

export function KitchenBatchCsvUpload({ variant = 'default', onComplete }: Props) {
  const { name, role } = useAuth()
  const { storeItems, kitchenStock, openKitchenBatchFromMaterials } = useSupplyChain()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [templateDownloading, setTemplateDownloading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const roleKey = canonicalRoleKey(role) ?? ''
  const canUpload = roleKey === 'superadmin' || roleKey === 'admin' || roleKey === 'manager'
  if (!canUpload) return null

  const actor = { name: name ?? 'Kitchen', role: roleKey || 'staff' }

  const downloadTemplate = async () => {
    if (templateDownloading) return
    setTemplateDownloading(true)
    try {
      const res = await fetch(KITCHEN_BATCH_CSV_TEMPLATE_PATH)
      if (!res.ok) throw new Error('Template file not found')
      const text = await res.text()
      const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = KITCHEN_BATCH_CSV_TEMPLATE_FILENAME
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download template. Use docs/frontbill-kitchen-batches-template.csv from the repo.')
    } finally {
      setTemplateDownloading(false)
    }
  }

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
      const importedPrepStock = new Map(
        kitchenStock.map((item) => [item.name.trim().toLowerCase(), item]),
      )

      for (const row of parsed.rows) {
        const materials = row.ingredientRows?.length
          ? mapIngredientRowsToMaterials(
              row.ingredientRows,
              storeItems,
              [...importedPrepStock.values()],
            )
          : row.ingredientLines?.length
            ? mapIngredientLinesToMaterials(row.ingredientLines, storeItems)
            : []
        totalIngredients += materials.length
        matchedIngredients += materials.filter(
          (m) => !m.storeItemId.startsWith('csv-ing-') && !m.storeItemId.startsWith('csv-prep-'),
        ).length

        const res = openKitchenBatchFromMaterials(
          {
            batchName: row.name,
            menuCategory: row.category,
            plannedPortions: row.portions,
            yieldUnit: row.yieldUnit || 'portion',
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
        importedPrepStock.set(row.name.trim().toLowerCase(), {
          id: res.kitchenStockId,
          name: row.name,
          source: 'produced',
          availablePortions: 0,
          unit: row.yieldUnit || 'portion',
          reorderLevel: Math.max(2, Math.ceil(row.portions * 0.15)),
          linkedRecipeId: res.recipeId,
        })
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                disabled={templateDownloading}
                onClick={() => void downloadTemplate()}
              >
                <Download className="h-4 w-4" />
                {templateDownloading ? 'Downloading…' : 'Download full template CSV'}
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Pre-filled hotel recipes — edit, delete, or add rows, then upload below.
              </span>
            </div>

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
              <span className="block font-medium text-foreground/80">Required format</span>
              <span className="block">
                Put the batch / menu name on the first ingredient row only. Leave that column blank for
                additional ingredients under the same recipe.
              </span>
            </p>
            <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium">Template preview (download for full list)</p>
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px] leading-relaxed">
                {TEMPLATE_PREVIEW}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
