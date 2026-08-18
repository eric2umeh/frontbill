import { format } from 'date-fns'
import {
  batchOutletMenuSyncLabel,
  normalizeBatchOutletMenuSync,
  shouldSyncBatchToOutlet,
} from '@/lib/supply-chain/batch-outlet-sync'
import { isProductionBatchDeleted } from '@/lib/supply-chain/kitchen-sync-merge'
import type { ProductionBatch, Recipe } from '@/lib/supply-chain/types'

export type KitchenToRestaurantRow = {
  id: string
  at: string
  itemName: string
  category: string
  portionsProduced: number
  sellableToRestaurant: number
  unit: string
  producedBy: string
  outletListing: string
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function sellablePortions(batch: ProductionBatch): number {
  const actual = Number(batch.actualPortions) || 0
  const d = batch.disposition
  if (!d) return actual
  return Math.max(0, actual - (d.staff || 0) - (d.waste || 0) - (d.returned || 0))
}

/** Closed kitchen production runs that feed Restaurant (listed on POS or sellable stock). */
export function kitchenToRestaurantRows(
  batches: ProductionBatch[] | null | undefined,
  recipes: Recipe[] | null | undefined,
): KitchenToRestaurantRow[] {
  const recipeById = new Map((recipes ?? []).map((r) => [r.id, r]))
  const rows: KitchenToRestaurantRow[] = []

  for (const batch of batches ?? []) {
    if (isProductionBatchDeleted(batch)) continue
    if (batch.status !== 'completed') continue
    const at = batch.closedAt || batch.openedAt
    if (!at) continue

    const recipe = batch.recipeId ? recipeById.get(batch.recipeId) : undefined
    const sync = normalizeBatchOutletMenuSync(recipe?.outletMenuSync ?? recipe?.fnbEligible)
    const sellable = sellablePortions(batch)
    const listed = shouldSyncBatchToOutlet(sync)
    if (!listed && sellable <= 0) continue
    if (recipe && !listed && sync === 'none') continue

    rows.push({
      id: batch.id,
      at,
      itemName: batch.recipeName,
      category: recipe?.category || '',
      portionsProduced: Number(batch.actualPortions) || 0,
      sellableToRestaurant: sellable,
      unit: recipe?.yieldUnit || 'portion',
      producedBy: batch.openedBy || batch.createdBy || '',
      outletListing: listed ? batchOutletMenuSyncLabel(sync) : 'Kitchen stock',
    })
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at))
}

/** CSV of kitchen production sent to Restaurant (Excel-friendly UTF-8 BOM). */
export function downloadKitchenToRestaurantReport(
  rows: KitchenToRestaurantRow[],
  opts?: { dateFrom?: string; dateTo?: string },
): void {
  const header = [
    'Date',
    'Time',
    'Item',
    'Category',
    'Portions produced',
    'Sellable to restaurant',
    'Unit',
    'Produced by',
    'Outlet listing',
  ]
  const body = rows.map((row) => {
    const at = new Date(row.at)
    const valid = !Number.isNaN(at.getTime())
    return [
      valid ? format(at, 'yyyy-MM-dd') : '',
      valid ? format(at, 'HH:mm') : '',
      row.itemName,
      row.category,
      row.portionsProduced,
      row.sellableToRestaurant,
      row.unit,
      row.producedBy,
      row.outletListing,
    ]
  })
  const from = opts?.dateFrom || ''
  const to = opts?.dateTo || ''
  const stamp =
    from && to && from !== to
      ? `${from}_to_${to}`
      : from || to || format(new Date(), 'yyyy-MM-dd')
  downloadCsv(`frontbill-restaurant-kitchen-items-${stamp}.csv`, [header, ...body])
}
