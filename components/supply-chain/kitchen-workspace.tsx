'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { formatNaira } from '@/lib/utils/currency'
import { canonicalRoleKey } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Flame, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { RESPONSIVE_HIDE_MD, RESPONSIVE_HIDE_LG } from '@/lib/ui/responsive-table'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { recipeTotalCost } from '@/lib/supply-chain/calculations'
import { sanitizeQuantityInput, parseQuantityValue } from '@/lib/supply-chain/measurement-units'
import { batchMaterialShortages } from '@/lib/supply-chain/batch-material-shortages'
import { BatchMaterialShortageList } from '@/components/supply-chain/batch-material-shortage-list'
import { syncBatchToRestaurantOutlet } from '@/lib/supply-chain/sync-restaurant-outlet'
import {
  batchOutletMenuSyncLabel,
  normalizeBatchOutletMenuSync,
  shouldSyncBatchToOutlet,
} from '@/lib/supply-chain/batch-outlet-sync'
import { outletStockSlug } from '@/lib/outlets/outlet-stock-slug'
import { PageHeader } from '@/components/layout/page-header'
import { RoomInventoryStatsStrip } from '@/components/shared/room-inventory-stats-strip'
import {
  getStockLevel,
  stockLevelBadgeClass,
  stockLevelRowClass,
  stockLevelStatusLabel,
  stockLevelTextClass,
} from '@/lib/supply-chain/stock-level-ui'

function batchOutletsPortions(batch: {
  actualPortions?: number
  disposition?: { sold: number; staff: number; waste: number; returned: number }
}): number {
  if (!batch.disposition) return 0
  const { staff, waste, returned } = batch.disposition
  return Math.max(0, (batch.actualPortions || 0) - staff - waste - returned)
}

export function KitchenWorkspace() {
  const { name, role } = useAuth()
  const {
    kitchenStock,
    kitchenRawStock,
    issueOutLog,
    storeItems,
    batches,
    recipes,
    openBatch,
    closeBatch,
    deleteRecipe,
    deleteInProgressBatch,
    getRecipeEconomics,
    kitchenRawOnHand,
  } = useSupplyChain()

  const [stockTick, setStockTick] = useState(0)
  useEffect(() => {
    const bump = () => setStockTick((t) => t + 1)
    window.addEventListener('frontbill:kitchen-raw-stock', bump)
    window.addEventListener('frontbill:supply-stock-changed', bump)
    window.addEventListener('frontbill:issue-out-log-changed', bump)
    return () => {
      window.removeEventListener('frontbill:kitchen-raw-stock', bump)
      window.removeEventListener('frontbill:supply-stock-changed', bump)
      window.removeEventListener('frontbill:issue-out-log-changed', bump)
    }
  }, [])

  const kitchenReceipts = useMemo(
    () =>
      (issueOutLog ?? []).filter((r) =>
        r.destination.trim().toLowerCase().includes('kitchen'),
      ),
    [issueOutLog],
  )

  const rawStockTableRows = useMemo(() => {
    const rawStock = kitchenRawStock ?? []
    const rawByStoreId = new Map(rawStock.map((r) => [r.storeItemId, r]))
    const rawByName = new Map(rawStock.map((r) => [r.name.trim().toLowerCase(), r]))
    const seenRawIds = new Set<string>()

    const rows = kitchenReceipts.map((receipt, index) => {
      const raw =
        rawByStoreId.get(receipt.storeItemId) ??
        rawByName.get(receipt.itemName.trim().toLowerCase())
      if (raw) seenRawIds.add(raw.id)
      return {
        key: `${receipt.id}-${index}`,
        itemName: receipt.itemName,
        onHand: raw?.quantityOnHand ?? null,
        reorder: raw?.reorderLevel ?? null,
        unit: receipt.unit,
        issuedAt: receipt.issuedAt,
        qtyIssued: receipt.quantity,
        receivedBy: receipt.receivedBy,
        issuedBy: receipt.issuedBy,
      }
    })

    for (const raw of rawStock) {
      if (seenRawIds.has(raw.id)) continue
      rows.push({
        key: raw.id,
        itemName: raw.name,
        onHand: raw.quantityOnHand,
        reorder: raw.reorderLevel,
        unit: raw.unit,
        issuedAt: undefined,
        qtyIssued: undefined,
        receivedBy: undefined,
        issuedBy: undefined,
      })
    }

    return rows
  }, [kitchenRawStock, kitchenReceipts, stockTick])
  const searchParams = useSearchParams()
  const mounted = useClientMounted()
  const [tab, setTab] = useState('stock')
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setTab(t)
  }, [searchParams])
  const [batchDialog, setBatchDialog] = useState<{ recipeId: string; defaultPortions: number } | null>(null)
  const [closeDialog, setCloseDialog] = useState<string | null>(null)
  const [budgetQty, setBudgetQty] = useState<Record<string, string>>({})
  const [deleteRecipeId, setDeleteRecipeId] = useState<string | null>(null)
  const [plannedInput, setPlannedInput] = useState('')
  const actor = { name: name ?? 'Kitchen', role: canonicalRoleKey(role) ?? 'staff' }
  const roleKey = canonicalRoleKey(role) ?? ''
  const canManageBatchStandards =
    roleKey === 'superadmin' || roleKey === 'admin' || roleKey === 'manager'

  const recipeCategoryFilterOptions = useMemo(() => {
    const cats = [...new Set(recipes.map((r) => r.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    )
    return cats.map((c) => ({ value: c, label: c }))
  }, [recipes])

  const recipeCategoryById = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.category])),
    [recipes],
  )

  const openBatchRecipe = batchDialog
    ? recipes.find((r) => r.id === batchDialog.recipeId)
    : undefined
  const openBatchPortions = batchDialog
    ? parseQuantityValue(plannedInput) || batchDialog.defaultPortions
    : 0
  const openBatchShortages = useMemo(
    () =>
      batchMaterialShortages(openBatchRecipe, openBatchPortions, kitchenRawOnHand),
    [openBatchRecipe, openBatchPortions, kitchenRawOnHand, kitchenRawStock, stockTick],
  )

  const closeBatchRecord = closeDialog
    ? batches.find((b) => b.id === closeDialog)
    : undefined
  const closeBatchRecipe = closeBatchRecord?.recipeId
    ? recipes.find((r) => r.id === closeBatchRecord.recipeId)
    : undefined
  const closeBatchShortages = useMemo(
    () =>
      batchMaterialShortages(
        closeBatchRecipe,
        closeBatchRecord?.plannedPortions ?? 0,
        kitchenRawOnHand,
      ),
    [closeBatchRecipe, closeBatchRecord?.plannedPortions, kitchenRawOnHand, kitchenRawStock, stockTick],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          className="min-w-0 flex-1"
          title="Kitchen"
          description="Production batches, raw stock, and Restaurant menu sync"
          trailing={<RoomInventoryStatsStrip className="shrink-0 scale-90 origin-right" />}
        />
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button className="shrink-0" asChild>
            <Link href="/supply/kitchen/new">
              <Plus className="h-4 w-4 mr-2" /> Open New Batch
            </Link>
          </Button>
        </div>
      </div>

      {!mounted ? (
        <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="stock">Finished Batch</TabsTrigger>
          <TabsTrigger value="raw-stock">Raw from Store</TabsTrigger>
          <TabsTrigger value="production">Production Records</TabsTrigger>
          <TabsTrigger value="recipes">All Batches</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
        </TabsList>

        <TabsContent value="raw-stock" className="mt-4 space-y-4">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Raw materials issued from Central Store → Kitchen: on-hand totals and each receipt in one
            table.
          </p>
          <div className="rounded-xl border overflow-hidden">
            {rawStockTableRows.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">
                No raw stock received yet. Ask store to issue kitchen items to the Kitchen destination.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className={`text-right ${RESPONSIVE_HIDE_MD}`}>Reorder at</TableHead>
                    <TableHead className={RESPONSIVE_HIDE_LG}>Time received</TableHead>
                    <TableHead className={RESPONSIVE_HIDE_MD}>Qty issued</TableHead>
                    <TableHead className={RESPONSIVE_HIDE_LG}>Received by</TableHead>
                    <TableHead className={RESPONSIVE_HIDE_LG}>Issued by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawStockTableRows.map((row) => {
                    const level =
                      row.onHand != null && row.reorder != null
                        ? getStockLevel(row.onHand, row.reorder)
                        : 'ok'
                    return (
                      <TableRow key={row.key} className={stockLevelRowClass(level)}>
                        <TableCell className="font-medium">{row.itemName}</TableCell>
                        <TableCell className="text-right">
                          {row.onHand != null ? (
                            <span className={stockLevelTextClass(level)}>
                              {row.onHand} {row.unit}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className={`text-right text-muted-foreground text-sm ${RESPONSIVE_HIDE_MD}`}>
                          {row.reorder != null ? `${row.reorder} ${row.unit}` : '—'}
                        </TableCell>
                        <TableCell className={`text-xs whitespace-nowrap ${RESPONSIVE_HIDE_LG}`}>
                          {row.issuedAt
                            ? new Date(row.issuedAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className={RESPONSIVE_HIDE_MD}>
                          {row.qtyIssued != null ? `${row.qtyIssued} ${row.unit}` : '—'}
                        </TableCell>
                        <TableCell className={RESPONSIVE_HIDE_LG}>{row.receivedBy || '—'}</TableCell>
                        <TableCell className={RESPONSIVE_HIDE_LG}>{row.issuedBy || '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Finished portions increase only when a production run is closed. Batch standards start at 0.
          </p>
          <PaginatedListShell
            items={kitchenStock}
            pageSize={15}
            searchPlaceholder="Search kitchen stock…"
            searchKeys={['name']}
            filters={[
              {
                key: 'stockLevel',
                label: 'Level',
                options: [
                  { value: 'out', label: 'Out' },
                  { value: 'low', label: 'Low' },
                  { value: 'ok', label: 'OK' },
                ],
              },
              {
                key: 'source',
                label: 'Source',
                options: [
                  { value: 'produced', label: 'Produced' },
                  { value: 'issued_raw', label: 'From store issue' },
                ],
              },
            ]}
            filterMatch={(k, key, value) => {
              if (key === 'stockLevel') {
                const level = getStockLevel(k.availablePortions, k.reorderLevel)
                if (value === 'out') return level === 'out'
                if (value === 'low') return level === 'low'
                return level === 'ok'
              }
              if (key === 'source') return k.source === value
              return undefined
            }}
          >
            {(pageItems) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className={RESPONSIVE_HIDE_MD}>Source</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className={`text-right ${RESPONSIVE_HIDE_MD}`}>Reorder</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((k) => {
                    const level = getStockLevel(k.availablePortions, k.reorderLevel)
                    return (
                      <TableRow key={k.id} className={stockLevelRowClass(level)}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell className={RESPONSIVE_HIDE_MD}>
                          <Badge className="bg-emerald-100 text-emerald-800">Produced</Badge>
                        </TableCell>
                        <TableCell className={`text-right ${stockLevelTextClass(level)}`}>
                          {k.availablePortions} portions
                        </TableCell>
                        <TableCell className={`text-right ${RESPONSIVE_HIDE_MD}`}>
                          {k.reorderLevel}
                        </TableCell>
                        <TableCell>
                          <Badge className={stockLevelBadgeClass(level)}>
                            {stockLevelStatusLabel(level)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </PaginatedListShell>
        </div>
        </TabsContent>

        <TabsContent value="production" className="mt-4">
        <div>
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2 mb-4">
            <strong className="text-foreground">Production records</strong> are chef production runs
            opened from All Batches. Raw stock deducts and finished stock updates when a run is closed.
          </p>
          <PaginatedListShell
            items={batches}
            pageSize={8}
            searchPlaceholder="Search batches…"
            searchMatch={(b, query) => {
              const q = query.trim().toLowerCase()
              return (
                b.recipeName.toLowerCase().includes(q) ||
                b.shift.toLowerCase().includes(q) ||
                b.status.toLowerCase().includes(q) ||
                b.openedBy.toLowerCase().includes(q)
              )
            }}
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'completed', label: 'Completed' },
                ],
              },
              ...(recipeCategoryFilterOptions.length
                ? [
                    {
                      key: 'category',
                      label: 'Category',
                      options: recipeCategoryFilterOptions,
                    },
                  ]
                : []),
            ]}
            filterMatch={(b, key, value) => {
              if (key === 'status') return b.status === value
              if (key === 'category') {
                const cat = b.recipeId ? recipeCategoryById.get(b.recipeId) : undefined
                return cat === value
              }
              return undefined
            }}
            emptyMessage="No production batches yet."
          >
            {(pageBatches) => (
              <div className="space-y-4">
                {pageBatches.map((b) => (
            <div key={b.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex justify-between">
                <div>
                  <h3 className="font-semibold">{b.recipeName} <Badge variant="outline">{b.shift}</Badge></h3>
                  <p className="text-xs text-muted-foreground">
                    {b.openedAt.slice(0, 10)} · opened by {b.openedBy}
                    {b.createdBy && b.createdBy !== b.openedBy ? ` · created by ${b.createdBy}` : ''}
                  </p>
                </div>
                <Badge className={b.status === 'in_progress' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}>
                  {b.status.replace('_', ' ')}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-muted-foreground">Planned</p><p className="font-bold">{b.plannedPortions}</p></div>
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-muted-foreground">Actual</p><p className="font-bold">{b.actualPortions || '—'}</p></div>
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-muted-foreground">Food Cost %</p><p className="font-bold">{b.foodCostPct}%</p></div>
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-muted-foreground">Variance</p><p className="font-bold">{b.variancePct}%</p></div>
              </div>
              <p className="text-xs"><span className="font-medium">Materials:</span> {b.materialsUsed.join(', ')}</p>
              {b.disposition && (
                <p className="text-xs flex gap-3">
                  <span className="text-emerald-600">{batchOutletsPortions(b)} Outlets</span>
                  <span className="text-blue-600">{b.disposition.staff} Staff</span>
                  <span className="text-red-600">{b.disposition.waste} Waste</span>
                </p>
              )}
              {b.status === 'in_progress' && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive gap-1"
                    onClick={() => {
                      const res = deleteInProgressBatch(b.id, actor)
                      if ('error' in res) toast.error(res.error)
                      else toast.success('Production run deleted — no stock was changed')
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete batch
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCloseDialog(b.id)
                    }}
                  >
                    Close Batch &amp; Record Disposition ({b.plannedPortions} portions)
                  </Button>
                </div>
              )}
            </div>
                ))}
              </div>
            )}
          </PaginatedListShell>
        </div>
        </TabsContent>

        <TabsContent value="recipes" className="mt-4 space-y-4">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
            <strong className="text-foreground">All Batches</strong> holds batch standards and costing.
            Default is not listed on outlet POS. Kitchen always supplies Restaurant — choose{' '}
            <strong className="text-foreground">Restaurant outlet</strong> or{' '}
            <strong className="text-foreground">Restaurant / F&amp;B outlet</strong> when creating
            or editing a batch.
          </p>
          <PaginatedListShell
            items={recipes}
            pageSize={6}
            searchPlaceholder="Search batches…"
            searchKeys={['name', 'category']}
            filters={[
              ...(recipeCategoryFilterOptions.length
                ? [
                    {
                      key: 'category',
                      label: 'Category',
                      options: recipeCategoryFilterOptions,
                    },
                  ]
                : []),
              {
                key: 'outletSync',
                label: 'Outlet listing',
                options: [
                  { value: 'restaurant', label: 'Restaurant outlet' },
                  { value: 'restaurant_fnb', label: 'Restaurant / F&B' },
                  { value: 'none', label: 'Not on POS' },
                ],
              },
            ]}
            filterMatch={(r, key, value) => {
              if (key === 'category') return r.category === value
              if (key === 'outletSync') {
                const sync = normalizeBatchOutletMenuSync(r.outletMenuSync ?? r.fnbEligible)
                return sync === value
              }
              return undefined
            }}
            emptyMessage="No recipes defined."
          >
            {(pageRecipes) => (
              <div className="grid gap-4 md:grid-cols-2">
                {pageRecipes.map((r) => {
            const econ = getRecipeEconomics(r)
            return (
              <div key={r.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex justify-between gap-2">
                  <h3 className="font-semibold">{r.name}</h3>
                  <div className="flex flex-wrap gap-1.5 justify-end items-start shrink-0">
                    <Badge variant="secondary">{r.category}</Badge>
                    {shouldSyncBatchToOutlet(
                      normalizeBatchOutletMenuSync(r.outletMenuSync ?? r.fnbEligible),
                    ) ? (
                      <Badge variant="default">
                        {batchOutletMenuSyncLabel(
                          normalizeBatchOutletMenuSync(r.outletMenuSync ?? r.fnbEligible),
                        )}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Yield: {r.yieldLabel}</p>
                <p className="text-sm font-medium text-emerald-600">Gross margin: {econ.marginPct}%</p>
                <ul className="text-sm space-y-1">
                  {r.ingredients.map((i) => (
                    <li key={i.name} className="flex justify-between">
                      <span>{i.name} — {i.quantity} {i.unit}</span>
                      <span>{formatNaira(i.cost)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between text-muted-foreground">
                    <span>Overhead (gas, labour, misc)</span>
                    <span>
                      {formatNaira(
                        (() => {
                          const breakdown =
                            (r.overheadLabour ?? 0) +
                            (r.overheadGas ?? 0) +
                            (r.overheadOther ?? 0)
                          return breakdown > 0 ? breakdown : r.overheadCost
                        })(),
                      )}
                    </span>
                  </li>
                </ul>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span>Cost / portion: {formatNaira(econ.costPerPortion)}</span>
                  <span className="text-emerald-600 font-medium">Sell: {formatNaira(r.sellingPricePerPortion)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Batch total cost {formatNaira(econ.totalCost)} → revenue {formatNaira(econ.revenue)} → profit {formatNaira(econ.profit)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManageBatchStandards && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        asChild
                      >
                        <Link href={`/supply/kitchen/edit/${r.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1 text-destructive hover:text-destructive"
                        onClick={() => setDeleteRecipeId(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                  <Button
                    className="flex-1 min-w-[140px]"
                    variant="outline"
                    disabled={batches.some(
                      (b) => b.recipeId === r.id && b.status === 'in_progress',
                    )}
                    onClick={() => {
                      setPlannedInput(String(r.yieldPortions))
                      setBatchDialog({ recipeId: r.id, defaultPortions: r.yieldPortions })
                    }}
                  >
                    <Flame className="h-4 w-4 mr-2" /> Open batch (add portions)
                  </Button>
                </div>
              </div>
            )
          })}
              </div>
            )}
          </PaginatedListShell>
        </div>
        </TabsContent>

        <TabsContent value="budget" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
            Plan market purchases: pick a batch standard and how many runs you need. Total cost
            includes ingredients and overhead per standard yield.
          </p>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className={RESPONSIVE_HIDE_MD}>Category</TableHead>
                  <TableHead className={`text-right ${RESPONSIVE_HIDE_LG}`}>Std yield</TableHead>
                  <TableHead className={`text-right ${RESPONSIVE_HIDE_MD}`}>Cost / batch</TableHead>
                  <TableHead className="text-right">Qty (runs)</TableHead>
                  <TableHead className="text-right">Budget total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipes.map((r) => {
                  const qty = Number(budgetQty[r.id] ?? 0) || 0
                  const unitCost = recipeTotalCost(r)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className={RESPONSIVE_HIDE_MD}>{r.category}</TableCell>
                      <TableCell className={`text-right ${RESPONSIVE_HIDE_LG}`}>
                        {r.yieldPortions}
                      </TableCell>
                      <TableCell className={`text-right ${RESPONSIVE_HIDE_MD}`}>
                        {formatNaira(unitCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 ml-auto text-right"
                          value={budgetQty[r.id] ?? ''}
                          onChange={(e) =>
                            setBudgetQty((m) => ({ ...m, [r.id]: e.target.value }))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {qty > 0 ? formatNaira(unitCost * qty) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm font-medium text-right">
            Grand total:{' '}
            {formatNaira(
              recipes.reduce((sum, r) => {
                const qty = Number(budgetQty[r.id] ?? 0) || 0
                return sum + recipeTotalCost(r) * qty
              }, 0),
            )}
          </p>
        </TabsContent>
      </Tabs>
      )}

      <Dialog
        open={!!batchDialog}
        onOpenChange={(open) => {
          if (!open) setBatchDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Open production batch</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Planned portions</Label>
              <Input
                inputMode="decimal"
                placeholder="e.g. 6"
                value={plannedInput}
                onChange={(e) => setPlannedInput(sanitizeQuantityInput(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Default is the batch standard yield ({batchDialog?.defaultPortions ?? 0} portions).
                Raw stock deducts when you close the run — check materials below first.
              </p>
            </div>
            <BatchMaterialShortageList
              portions={openBatchPortions}
              shortages={openBatchShortages}
              shortHint="Issue these from central store → kitchen before you close the run."
            />
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!batchDialog) return
                const planned =
                  parseQuantityValue(plannedInput) || batchDialog.defaultPortions
                if (planned <= 0) {
                  toast.error('Enter valid planned portions')
                  return
                }
                const res = openBatch(batchDialog.recipeId, planned, actor)
                if ('error' in res) {
                  toast.error(res.error)
                  return
                }
                toast.success('Production run opened — close it when cooking is done')
                setBatchDialog(null)
                setTab('production')
              }}
            >
              Start batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!closeDialog} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close batch</DialogTitle></DialogHeader>
          {closeDialog && (() => {
            const batch = closeBatchRecord
            const portions = batch?.plannedPortions ?? 0
            return (
              <>
                <p className="text-sm text-muted-foreground">
                  Closes this production run and deducts raw materials from kitchen stock. Finished
                  portions are added to outlet stock when you close.
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Portions produced</Label>
                    <Input readOnly className="bg-muted mt-0.5" value={String(portions)} />
                  </div>
                  <BatchMaterialShortageList
                    portions={portions}
                    shortages={closeBatchShortages}
                    shortHint="Issue these from central store → kitchen, then close the run."
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCloseDialog(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={closeBatchShortages.length > 0}
                    onClick={async () => {
                      const batch = batches.find((b) => b.id === closeDialog)
                      const recipe = batch?.recipeId
                        ? recipes.find((r) => r.id === batch.recipeId)
                        : undefined
                      const actual = batch?.plannedPortions ?? 0
                      if (actual <= 0) {
                        toast.error('Invalid portions for this batch')
                        return
                      }
                      const res = closeBatch(
                        closeDialog,
                        actual,
                        { sold: actual, staff: 0, waste: 0, returned: 0 },
                        actor,
                      )
                      if ('error' in res) {
                        toast.error(res.error)
                        return
                      }
                      const outletSync = recipe
                        ? normalizeBatchOutletMenuSync(recipe.outletMenuSync ?? recipe.fnbEligible)
                        : 'none'
                      if (shouldSyncBatchToOutlet(outletSync)) {
                        const kitchenStockId =
                          batch?.kitchenStockId ?? `ks-${outletStockSlug(recipe!.name)}`
                        const sync = await syncBatchToRestaurantOutlet({
                          batchName: recipe!.name,
                          categoryName: recipe!.category,
                          kitchenStockId,
                          unitPrice: recipe!.sellingPricePerPortion,
                          outletMenuSync: outletSync,
                        })
                        if (sync.ok) {
                          toast.success(
                            `${actual} portions of ${recipe!.name} ready — ${batchOutletMenuSyncLabel(outletSync)}`,
                          )
                        } else {
                          toast.warning(
                            `Production closed but outlet sync failed: ${sync.error}. Edit batch and select an outlet listing, then save.`,
                          )
                        }
                      } else {
                        toast.success(
                          `${actual} portions added to finished batch (not listed on outlet POS)`,
                        )
                      }
                      setCloseDialog(null)
                    }}
                  >
                    Close production run
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteRecipeId} onOpenChange={() => setDeleteRecipeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete batch standard?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the batch standard and linked finished-stock row. Production records for this
            batch will also be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRecipeId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteRecipeId) return
                const res = deleteRecipe(deleteRecipeId, actor)
                if ('error' in res) {
                  toast.error(res.error)
                  return
                }
                toast.success('Batch standard deleted')
                setDeleteRecipeId(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
