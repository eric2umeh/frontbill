'use client'

import { useMemo, useState } from 'react'
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
import { Flame, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { KitchenBatchBuilder } from '@/components/supply-chain/kitchen-batch-builder'
import { RecipeBatchDialog } from '@/components/supply-chain/recipe-batch-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { RoomInventoryStatsStrip } from '@/components/shared/room-inventory-stats-strip'
import type { Recipe } from '@/lib/supply-chain/types'
import {
  getStockLevel,
  stockLevelBadgeClass,
  stockLevelRowClass,
  stockLevelStatusLabel,
  stockLevelTextClass,
} from '@/lib/supply-chain/stock-level-ui'

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
    updateRecipe,
    deleteRecipe,
    clearKitchenRestaurantMenu,
    getRecipeEconomics,
  } = useSupplyChain()

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

    const rows = kitchenReceipts.map((receipt) => {
      const raw =
        rawByStoreId.get(receipt.storeItemId) ??
        rawByName.get(receipt.itemName.trim().toLowerCase())
      if (raw) seenRawIds.add(raw.id)
      return {
        key: receipt.id,
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
  }, [kitchenRawStock, kitchenReceipts])
  const mounted = useClientMounted()
  const [tab, setTab] = useState('stock')
  const [clearingMenu, setClearingMenu] = useState(false)
  const [batchDialog, setBatchDialog] = useState<{ recipeId: string } | null>(null)
  const [closeDialog, setCloseDialog] = useState<string | null>(null)
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null)
  const [deleteRecipeId, setDeleteRecipeId] = useState<string | null>(null)
  const [planned, setPlanned] = useState(4)
  const [actual, setActual] = useState(4)
  const actor = { name: name ?? 'Kitchen', role: canonicalRoleKey(role) ?? 'staff' }
  const roleKey = canonicalRoleKey(role) ?? ''
  const canManageBatchStandards =
    roleKey === 'superadmin' || roleKey === 'admin' || roleKey === 'manager'

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
          {canManageBatchStandards && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={clearingMenu}>
                  <UtensilsCrossed className="h-4 w-4 mr-2" />
                  Clear restaurant & kitchen menu
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all restaurant & kitchen menu items?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Deletes every Restaurant outlet menu item (including kickstart quantities from
                    kitchen stock). Also clears kitchen finished stock, batch standards, and
                    production records on this device. Menu categories are kept.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      setClearingMenu(true)
                      try {
                        const res = await fetch('/api/supply/clear-restaurant-kitchen-menu', {
                          method: 'POST',
                          credentials: 'include',
                        })
                        const json = await res.json().catch(() => ({}))
                        if (!res.ok) {
                          toast.error(json.error ?? 'Failed to clear restaurant items')
                          return
                        }
                        const local = clearKitchenRestaurantMenu(actor)
                        if ('error' in local) {
                          toast.error(local.error)
                          return
                        }
                        const parts = [
                          json.deleted
                            ? `${json.deleted} restaurant item(s) removed`
                            : 'No restaurant items in database',
                          `${local.recipesCleared} batch standard(s)`,
                          `${local.stockCleared} kitchen stock row(s)`,
                          `${local.batchesCleared} production record(s)`,
                        ]
                        toast.success(`Menu cleared — ${parts.join(', ')}. Categories kept.`)
                      } catch {
                        toast.error('Could not reach server')
                      } finally {
                        setClearingMenu(false)
                      }
                    }}
                  >
                    Clear all items
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {tab !== 'new-batch' && (
            <Button className="shrink-0" onClick={() => setTab('new-batch')}>
              <Plus className="h-4 w-4 mr-2" /> Open New Batch
            </Button>
          )}
        </div>
      </div>

      {!mounted ? (
        <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="stock">Finished Batch</TabsTrigger>
          <TabsTrigger value="raw-stock">Raw from Store</TabsTrigger>
          <TabsTrigger value="new-batch">New batch</TabsTrigger>
          <TabsTrigger value="production">Production Records</TabsTrigger>
          <TabsTrigger value="recipes">All Batches</TabsTrigger>
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
                    <TableHead className="text-right">Reorder at</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Qty issued</TableHead>
                    <TableHead>Received by</TableHead>
                    <TableHead>Issued by</TableHead>
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
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {row.reorder != null ? `${row.reorder} ${row.unit}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {row.issuedAt ? new Date(row.issuedAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          {row.qtyIssued != null ? `${row.qtyIssued} ${row.unit}` : '—'}
                        </TableCell>
                        <TableCell>{row.receivedBy || '—'}</TableCell>
                        <TableCell>{row.issuedBy || '—'}</TableCell>
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
            Produced portions deplete as Restaurant orders are posted. Raw materials are consumed when batches open.
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
            ]}
            filterMatch={(k, key, value) => {
              if (key !== 'stockLevel') return undefined
              const level = getStockLevel(k.availablePortions, k.reorderLevel)
              if (value === 'out') return level === 'out'
              if (value === 'low') return level === 'low'
              return level === 'ok'
            }}
          >
            {(pageItems) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((k) => {
                    const level = getStockLevel(k.availablePortions, k.reorderLevel)
                    return (
                      <TableRow key={k.id} className={stockLevelRowClass(level)}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell><Badge className="bg-emerald-100 text-emerald-800">Produced</Badge></TableCell>
                        <TableCell className={`text-right ${stockLevelTextClass(level)}`}>
                          {k.availablePortions} portions
                        </TableCell>
                        <TableCell className="text-right">{k.reorderLevel}</TableCell>
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

        <TabsContent value="new-batch" className="mt-4">
          <KitchenBatchBuilder />
        </TabsContent>

        <TabsContent value="production" className="mt-4">
        <div>
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2 mb-4">
            <strong className="text-foreground">Production records</strong> are live production runs
            (opened / closed batches). <strong className="text-foreground">All Batches</strong> holds
            the batch standards chefs open to add portions.
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
                  { value: 'closed', label: 'Closed' },
                ],
              },
            ]}
            filterMatch={(b, key, value) => {
              if (key !== 'status') return undefined
              return b.status === value
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
                  <p className="text-xs text-muted-foreground">{b.openedAt.slice(0, 10)} · {b.openedBy}</p>
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
                  <span className="text-emerald-600">{b.disposition.sold} Sold</span>
                  <span className="text-blue-600">{b.disposition.staff} Staff</span>
                  <span className="text-red-600">{b.disposition.waste} Waste</span>
                </p>
              )}
              {b.status === 'in_progress' && (
                <Button size="sm" className="ml-auto" onClick={() => setCloseDialog(b.id)}>Close Batch & Record Disposition</Button>
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
            <strong className="text-foreground">All Batches</strong> holds every batch standard, ingredient
            list, and costing. New batches from the kitchen sync to the Restaurant outlet menu automatically.
          </p>
          <PaginatedListShell
            items={recipes}
            pageSize={6}
            searchPlaceholder="Search recipes…"
            searchKeys={['name', 'category']}
            emptyMessage="No recipes defined."
          >
            {(pageRecipes) => (
              <div className="grid gap-4 md:grid-cols-2">
                {pageRecipes.map((r) => {
            const econ = getRecipeEconomics(r)
            return (
              <div key={r.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex justify-between">
                  <h3 className="font-semibold">{r.name}</h3>
                  <Badge variant="secondary">{r.category}</Badge>
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
                    <span>{formatNaira(r.overheadCost)}</span>
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
                        onClick={() => setEditRecipe(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
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
                    onClick={() => {
                      setPlanned(r.yieldPortions)
                      setBatchDialog({ recipeId: r.id })
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
      </Tabs>
      )}

      <Dialog open={!!batchDialog} onOpenChange={() => setBatchDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open production batch</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Planned portions</Label>
            <Input type="number" value={planned} onChange={(e) => setPlanned(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">
              Raw materials deduct from kitchen stock (must be issued out from Central Store first).
              Finished portions are added when the batch closes.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!batchDialog) return
                const res = openBatch(batchDialog.recipeId, planned, actor)
                if (!res) {
                  toast.error('Batch standard not found')
                  return
                }
                if ('error' in res) {
                  toast.error(res.error)
                  return
                }
                toast.success('Production batch opened')
                setBatchDialog(null)
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
          <Label>Actual portions produced</Label>
          <Input type="number" value={actual} onChange={(e) => setActual(Number(e.target.value))} className="mb-4" />
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!closeDialog) return
                closeBatch(closeDialog, actual, { sold: 0, staff: 0, waste: 0, returned: 0 }, actor)
                toast.success(`${actual} portions added to kitchen finished stock`)
                setCloseDialog(null)
              }}
            >
              Close &amp; push to F&amp;B
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecipeBatchDialog
        recipe={editRecipe}
        open={!!editRecipe}
        onOpenChange={(open) => {
          if (!open) setEditRecipe(null)
        }}
        onSave={async (patch) => {
          if (!editRecipe) return
          const res = updateRecipe(editRecipe.id, patch, actor)
          if ('error' in res) {
            toast.error(res.error)
            return
          }
          toast.success('Batch standard updated')
          setEditRecipe(null)
        }}
      />

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
