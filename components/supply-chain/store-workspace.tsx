'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { DEPT_LABELS, type SupplyDept } from '@/lib/supply-chain/types'
import { priceVariancePct } from '@/lib/supply-chain/calculations'
import { SupplyStatRow, DeptPill } from '@/lib/supply-chain/supply-ui'
import { formatNaira } from '@/lib/utils/currency'
import { canonicalRoleKey } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Package, AlertTriangle, ShoppingCart, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import {
  getStockLevel,
  stockLevelBadgeClass,
  stockLevelNumberPillClass,
  stockLevelStatusLabel,
} from '@/lib/supply-chain/stock-level-ui'
import { PoApprovalPanel, poStatusBadge } from '@/components/supply-chain/po-approval-panel'

const DEPTS: SupplyDept[] = ['all', 'kitchen', 'bar', 'housekeeping', 'maintenance', 'front_office', 'laundry']

export function StoreWorkspace() {
  const { name, role } = useAuth()
  const {
    storeItems,
    basket,
    addToBasket,
    clearBasket,
    submitBasketAsPo,
    purchaseOrders,
    stats,
    activityLog,
    issueFromStoreToBar,
    barStock,
  } = useSupplyChain()
  const [dept, setDept] = useState<SupplyDept>('all')
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [issueQtyMap, setIssueQtyMap] = useState<Record<string, string>>({})
  const [tab, setTab] = useState('stock')

  const filtered = useMemo(() => {
    if (dept === 'all') return storeItems
    return storeItems.filter((s) => s.dept === dept)
  }, [storeItems, dept])

  const barStoreItems = useMemo(
    () => storeItems.filter((s) => s.dept === 'bar'),
    [storeItems],
  )

  const basketByDept = useMemo(() => {
    const m = new Map<string, typeof basket>()
    for (const b of basket) {
      if (!m.has(b.dept)) m.set(b.dept, [])
      m.get(b.dept)!.push(b)
    }
    return m
  }, [basket])

  const deptBasketCounts = useMemo(() => {
    const c: Partial<Record<SupplyDept, number>> = {}
    for (const b of basket) c[b.dept] = (c[b.dept] ?? 0) + 1
    return c
  }, [basket])

  const actor = { name: name ?? 'Store', role: canonicalRoleKey(role) ?? 'store' }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central Store</h1>
        <p className="text-sm text-muted-foreground">Stock levels, dept purchase lists & master PO</p>
      </div>

      <SupplyStatRow
        cards={[
          { label: 'Total Items', value: stats.totalStoreItems, icon: Package, tone: 'green' },
          { label: 'Stock Alerts', value: stats.stockAlerts, icon: AlertTriangle, tone: 'red' },
          { label: 'Basket Items', value: stats.basketCount, icon: ShoppingCart, tone: 'amber' },
          { label: 'Basket Total', value: formatNaira(stats.basketTotal), icon: TrendingUp, tone: 'green' },
        ]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="purchase">Raise Purchase Request</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap gap-2 mt-4">
          {DEPTS.map((d) => (
            <DeptPill
              key={d}
              dept={d}
              label={DEPT_LABELS[d]}
              active={dept === d}
              count={d !== 'all' ? deptBasketCounts[d] : undefined}
              onClick={() => setDept(d)}
            />
          ))}
        </div>

        <TabsContent value="stock" className="mt-4">
          <div className="rounded-xl border overflow-hidden">
            <div className="border-b px-4 py-2 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">All Stock Items</span>
              <span className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                <span className="text-red-700 font-medium">Red = out (0)</span>
                <span className="text-amber-700 font-medium">Amber = low (at/below reorder)</span>
                <span className="text-emerald-700">Green = OK</span>
              </span>
            </div>
            <div className="p-3">
              <PaginatedListShell
                items={filtered}
                pageSize={15}
                searchPlaceholder="Search items…"
                searchKeys={['name', 'dept']}
                filters={[
                  {
                    key: 'stockStatus',
                    label: 'Stock',
                    options: [
                      { value: 'out', label: 'Out of stock' },
                      { value: 'low', label: 'Low stock' },
                      { value: 'ok', label: 'OK' },
                    ],
                  },
                ]}
                filterMatch={(item, key, value) => {
                  if (key !== 'stockStatus') return undefined
                  const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                  return level === value
                }}
                emptyMessage="No stock items match your filters."
              >
                {(pageItems) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Dept</TableHead>
                        <TableHead className="text-right">In Store</TableHead>
                        <TableHead className="text-right">Reorder</TableHead>
                        <TableHead className="text-right">Last Price</TableHead>
                        <TableHead className="text-right">Benchmark</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageItems.map((item) => {
                        const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                        const varPct = priceVariancePct(item.lastPrice, item.benchmarkPrice)
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name} ({item.unit})</TableCell>
                            <TableCell><Badge variant="secondary">{DEPT_LABELS[item.dept]}</Badge></TableCell>
                            <TableCell className="text-right">
                              <span className={stockLevelNumberPillClass(level)}>
                                {item.quantityInStore} {item.unit}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{item.reorderLevel}</TableCell>
                            <TableCell className="text-right">{formatNaira(item.lastPrice)}</TableCell>
                            <TableCell className="text-right">{formatNaira(item.benchmarkPrice)}</TableCell>
                            <TableCell className="text-right text-emerald-600">{varPct.toFixed(1)}%</TableCell>
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
          </div>

          {(dept === 'bar' || dept === 'all') && barStoreItems.length > 0 && (
            <div className="mt-4 rounded-xl border p-4 space-y-3">
              <div>
                <h3 className="font-semibold text-sm">Issue bar stock → Main Bar / Pool Bar POS</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Move bottles and mixers from central store to bar outlet stock. POS drink sales deduct from bar stock only.
                </p>
              </div>
              <div className="space-y-2">
                {barStoreItems.map((item) => {
                  const onBar = barStock.find((b) => b.storeItemId === item.id)
                  const issueQty = Number(issueQtyMap[item.id] ?? 0)
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Store: {item.quantityInStore} {item.unit}
                          {onBar ? ` · Bar: ${onBar.quantityOnHand} ${item.unit}` : ' · Bar: not issued yet'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20"
                          value={issueQtyMap[item.id] ?? ''}
                          onChange={(e) =>
                            setIssueQtyMap((m) => ({ ...m, [item.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!issueQty}
                          onClick={() => {
                            const res = issueFromStoreToBar(item.id, issueQty, actor)
                            if (res && 'error' in res) toast.error(res.error)
                            else {
                              toast.success(`Issued ${issueQty} ${item.unit} to bar`)
                              setIssueQtyMap((m) => ({ ...m, [item.id]: '' }))
                            }
                          }}
                        >
                          Issue to bar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {dept === 'kitchen' && (
            <p className="mt-3 text-xs text-muted-foreground rounded-md border px-3 py-2">
              Kitchen raw materials are issued when a production batch is opened in{' '}
              <Link href="/supply/kitchen" className="underline font-medium">
                Kitchen → Open Batch
              </Link>
              . Finished portions then feed restaurant &amp; banquets POS.
            </p>
          )}
        </TabsContent>

        <TabsContent value="purchase" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="rounded-xl border">
              <div className="border-b px-4 py-2 text-sm text-muted-foreground">
                Enter quantities to add to basket. Items are not submitted until you confirm in Purchase Orders.
              </div>
              <div className="p-3">
                <PaginatedListShell
                  items={filtered}
                  pageSize={15}
                  searchPlaceholder="Search items to purchase…"
                  searchKeys={['name']}
                  emptyMessage="No items match your search."
                >
                  {(pageItems) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Dept</TableHead>
                          <TableHead className="text-right">In Store</TableHead>
                          <TableHead className="text-right">Qty to Buy</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageItems.map((item) => {
                          const qty = Number(qtyMap[item.id] ?? 0)
                          const price = item.lastPrice
                          const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{item.name} ({item.unit})</TableCell>
                              <TableCell><Badge variant="outline">{DEPT_LABELS[item.dept]}</Badge></TableCell>
                              <TableCell className="text-right">
                                <span className={stockLevelNumberPillClass(level)}>
                                  {item.quantityInStore}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 w-20 ml-auto text-right"
                                  value={qtyMap[item.id] ?? ''}
                                  onChange={(e) => setQtyMap((m) => ({ ...m, [item.id]: e.target.value }))}
                                />
                              </TableCell>
                              <TableCell className="text-right">{formatNaira(price)}</TableCell>
                              <TableCell className="text-right tabular-nums">{qty ? formatNaira(qty * price) : '—'}</TableCell>
                              <TableCell>
                                <Button size="sm" variant="outline" disabled={!qty} onClick={() => { addToBasket(item, qty, price); toast.success(`Added ${item.name}`) }}>
                                  Add
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </PaginatedListShell>
              </div>
            </div>
            <BasketSidebar basket={basket} basketByDept={basketByDept} total={stats.basketTotal} onClear={clearBasket} onSubmit={() => { submitBasketAsPo(actor); toast.success('PO raised — awaiting accountant approval'); setTab('orders') }} />
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-4">
          <PoApprovalPanel />
          <PaginatedListShell
            items={purchaseOrders}
            pageSize={10}
            searchPlaceholder="Search PO number, week, status…"
            searchMatch={(po, query) => {
              const q = query.trim().toLowerCase()
              return (
                po.poNumber.toLowerCase().includes(q) ||
                po.weekLabel.toLowerCase().includes(q) ||
                po.status.toLowerCase().includes(q) ||
                po.createdByName.toLowerCase().includes(q)
              )
            }}
            emptyMessage="No purchase orders yet."
          >
            {(pagePos) => (
              <div className="space-y-3">
                {pagePos.map((po) => (
                  <div key={po.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{po.poNumber} — {po.weekLabel}</p>
                        {poStatusBadge(po.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {po.createdByName} · {formatNaira(po.totalAmount)}
                      </p>
                      {po.accountantComment && (
                        <p className="text-xs text-muted-foreground">Accountant: {po.accountantComment}</p>
                      )}
                      {po.managerComment && (
                        <p className="text-xs text-muted-foreground">Manager: {po.managerComment}</p>
                      )}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/supply/purchasing?po=${po.id}`}>View / Retire</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </PaginatedListShell>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <PaginatedListShell
            items={activityLog}
            pageSize={20}
            searchPlaceholder="Search activity…"
            searchKeys={['summary', 'action', 'actorName']}
            emptyMessage="No activity recorded."
          >
            {(pageLog) => (
              <ul className="space-y-2 text-sm">
                {pageLog.map((a) => (
                  <li key={a.id} className="border-b pb-2">
                    <span className="text-muted-foreground">{new Date(a.timestamp).toLocaleString()} — </span>
                    {a.summary}
                  </li>
                ))}
              </ul>
            )}
          </PaginatedListShell>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BasketSidebar({
  basket,
  basketByDept,
  total,
  onClear,
  onSubmit,
}: {
  basket: ReturnType<typeof useSupplyChain>['basket']
  basketByDept: Map<string, typeof basket>
  total: number
  onClear: () => void
  onSubmit: () => void
}) {
  return (
    <div className="rounded-xl border bg-card p-4 h-fit sticky top-4 shadow-md">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Basket</h3>
        {basket.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
        )}
      </div>
      {!basket.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Empty</p>
      ) : (
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {[...basketByDept.entries()].map(([dept, lines]) => (
            <div key={dept}>
              <p className="text-xs font-bold text-muted-foreground mb-1">{DEPT_LABELS[dept as SupplyDept]?.toUpperCase()}</p>
              {lines.map((l) => (
                <div key={l.stockItemId} className="flex justify-between text-sm py-0.5">
                  <span>{l.name} ({l.qtyToBuy} {l.unit})</span>
                  <span className="tabular-nums">{formatNaira(l.qtyToBuy * l.unitPrice)}</span>
                </div>
              ))}
              <p className="text-right text-sm font-medium text-emerald-600 mt-1">
                {formatNaira(lines.reduce((s, l) => s + l.qtyToBuy * l.unitPrice, 0))}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="border-t mt-4 pt-3 flex justify-between font-bold">
        <span>Total</span>
        <span>{formatNaira(total)}</span>
      </div>
      <Button className="w-full mt-3" disabled={!basket.length} onClick={onSubmit}>
        Go to Purchase Orders →
      </Button>
    </div>
  )
}
