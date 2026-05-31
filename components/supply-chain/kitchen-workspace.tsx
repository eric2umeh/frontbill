'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { SupplyStatRow } from '@/lib/supply-chain/supply-ui'
import { formatNaira } from '@/lib/utils/currency'
import { canonicalRoleKey } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Package, AlertTriangle, Flame, ChefHat, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
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
    storeItems,
    kitchenStock,
    batches,
    recipes,
    stats,
    openBatch,
    closeBatch,
    getRecipeEconomics,
    issueRawToKitchenPortions,
  } = useSupplyChain()
  const [tab, setTab] = useState('stock')
  const [batchDialog, setBatchDialog] = useState<{ recipeId: string } | null>(null)
  const [closeDialog, setCloseDialog] = useState<string | null>(null)
  const [planned, setPlanned] = useState(4)
  const [actual, setActual] = useState(4)
  const [rawStoreItemId, setRawStoreItemId] = useState('')
  const [rawQty, setRawQty] = useState('')
  const [rawPortions, setRawPortions] = useState('')
  const [rawKitchenStockId, setRawKitchenStockId] = useState('__new__')
  const [rawFinishedName, setRawFinishedName] = useState('')
  const [rawNotes, setRawNotes] = useState('')
  const actor = { name: name ?? 'Kitchen', role: canonicalRoleKey(role) ?? 'staff' }

  const kitchenStoreItems = storeItems.filter((s) => s.dept === 'kitchen')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kitchen</h1>
          <p className="text-sm text-muted-foreground">Recipes, production batches & kitchen stock</p>
        </div>
        <Button onClick={() => setTab('recipes')}>
          <Plus className="h-4 w-4 mr-2" /> Open New Batch
        </Button>
      </div>

      <SupplyStatRow
        cards={[
          { label: 'Kitchen Stock Items', value: kitchenStock.length, icon: Package, tone: 'green' },
          { label: 'Stock Alerts', value: kitchenStock.filter((k) => k.availablePortions <= k.reorderLevel).length, icon: AlertTriangle, tone: 'amber' },
          { label: 'Active Batches', value: stats.activeBatches, icon: Flame, tone: 'blue' },
          { label: 'Recipes', value: stats.recipeCount, icon: ChefHat, tone: 'purple' },
        ]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="stock">Kitchen Stock</TabsTrigger>
          <TabsTrigger value="issue-raw">Issue raw → portions</TabsTrigger>
          <TabsTrigger value="production">Production Records</TabsTrigger>
          <TabsTrigger value="recipes">Recipe Master</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Produced portions deplete as F&B orders are posted. Raw materials issued by store when batch opens.
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
        </TabsContent>

        <TabsContent value="issue-raw" className="mt-4 space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 text-sm space-y-2">
            <p className="font-medium">Flexible yield — raw store → kitchen portions</p>
            <p className="text-muted-foreground">
              Enter the actual outcome each time. Yields are not fixed — examples:
            </p>
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
              <li>Beef 1 kg → 4 portions · 3 kg → 12 portions</li>
              <li>Chicken 6 kg → 4 whole birds → 16 portions</li>
              <li>Goat 3 kg → 7 portions · 5 kg → 15 · 10 kg → 30 portions</li>
            </ul>
          </div>

          <div className="rounded-xl border p-4 grid gap-4 md:grid-cols-2 max-w-3xl">
            <div className="space-y-2 md:col-span-2">
              <Label>Raw material (central store — kitchen dept)</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={rawStoreItemId}
                onChange={(e) => setRawStoreItemId(e.target.value)}
              >
                <option value="">Select item…</option>
                {kitchenStoreItems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.quantityInStore} {s.unit} in store
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Raw quantity issued</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                placeholder="e.g. 3"
                value={rawQty}
                onChange={(e) => setRawQty(e.target.value)}
              />
              {rawStoreItemId && (
                <p className="text-[11px] text-muted-foreground">
                  Unit: {kitchenStoreItems.find((s) => s.id === rawStoreItemId)?.unit ?? 'kg'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Portions produced (flexible)</Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 12"
                value={rawPortions}
                onChange={(e) => setRawPortions(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Credit kitchen stock item</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={rawKitchenStockId}
                onChange={(e) => setRawKitchenStockId(e.target.value)}
              >
                <option value="__new__">New / match by name below</option>
                {kitchenStock.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} — {k.availablePortions} portions now
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Finished item name (restaurant menu / kitchen stock)</Label>
              <Input
                placeholder="e.g. Beef stew portion, Peppered Chicken"
                value={rawFinishedName}
                onChange={(e) => setRawFinishedName(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notes (optional breakdown)</Label>
              <Input
                placeholder="e.g. 6 kg → 4 whole chicken → 16 guest portions"
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Button
                onClick={() => {
                  const res = issueRawToKitchenPortions(
                    {
                      storeItemId: rawStoreItemId,
                      rawQuantity: Number(rawQty),
                      portionsProduced: Number(rawPortions),
                      kitchenStockId:
                        rawKitchenStockId === '__new__' ? undefined : rawKitchenStockId,
                      finishedItemName: rawFinishedName,
                      notes: rawNotes.trim() || undefined,
                    },
                    actor,
                  )
                  if ('error' in res) toast.error(res.error)
                  else {
                    toast.success('Raw issued — kitchen portions updated')
                    setRawQty('')
                    setRawPortions('')
                    setRawNotes('')
                    setTab('stock')
                  }
                }}
              >
                Issue to kitchen &amp; add portions
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="production" className="mt-4">
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
        </TabsContent>

        <TabsContent value="recipes" className="mt-4">
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
                <Button className="w-full" variant="outline" onClick={() => { setPlanned(r.yieldPortions); setBatchDialog({ recipeId: r.id }) }}>
                  <Flame className="h-4 w-4 mr-2" /> Open Batch
                </Button>
              </div>
            )
          })}
              </div>
            )}
          </PaginatedListShell>
        </TabsContent>
      </Tabs>

      <Dialog open={!!batchDialog} onOpenChange={() => setBatchDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open production batch</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Planned portions</Label>
            <Input type="number" value={planned} onChange={(e) => setPlanned(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Raw materials deduct from central store immediately. Finished portions go to F&B when batch closes.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              if (!batchDialog) return
              const res = openBatch(batchDialog.recipeId, planned, actor)
              if (res && 'error' in res) toast.error(res.error)
              else { toast.success('Batch opened'); setBatchDialog(null); setTab('production') }
            }}>Start batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!closeDialog} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close batch</DialogTitle></DialogHeader>
          <Label>Actual portions produced</Label>
          <Input type="number" value={actual} onChange={(e) => setActual(Number(e.target.value))} className="mb-4" />
          <DialogFooter>
            <Button onClick={() => {
              if (!closeDialog) return
              closeBatch(closeDialog, actual, { sold: 0, staff: 0, waste: 0, returned: 0 }, actor)
              toast.success(`${actual} portions added to F&B kitchen stock`)
              setCloseDialog(null)
              setTab('stock')
            }}>Close & push to F&B</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
