'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { formatNaira } from '@/lib/utils/currency'
import { canonicalRoleKey, canManageFnbStore } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { RESPONSIVE_HIDE_MD, RESPONSIVE_HIDE_LG } from '@/lib/ui/responsive-table'
import type { FnbDailySheetLine } from '@/lib/supply-chain/types'
import {
  fnbSheetAmount,
  fnbSheetClosing,
  formatSupplyActorStamp,
  localYmd,
  seedFnbDailyLines,
} from '@/lib/supply-chain/fnb-store'
import { syncBarItemToMainBarMenu } from '@/lib/supply-chain/sync-bar-menu'
import {
  fetchOutletCategories,
  seedDefaultDrinkCategories,
} from '@/lib/outlets/seed-drink-categories'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { ClipboardList, FolderTree, Plus, Wine } from 'lucide-react'

function numOrZero(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function FnbStoreWorkspace() {
  const { name, role } = useAuth()
  const {
    fnbRawStock,
    barStock,
    fnbDailySheets,
    fnbMovements,
    issueOutLog,
    saveFnbDailySheet,
    transferFnbToMainBar,
    setFnbItemCategory,
  } = useSupplyChain()
  const [stockTick, setStockTick] = useState(0)
  const actor = { name: name ?? 'F&B', role: canonicalRoleKey(role) ?? 'staff' }
  const canManage = canManageFnbStore(role)

  const [tab, setTab] = useState('daily')
  const [ymd, setYmd] = useState(localYmd)
  const [lines, setLines] = useState<FnbDailySheetLine[]>([])
  const [moveQty, setMoveQty] = useState<Record<string, string>>({})
  const [moveNote, setMoveNote] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<OutletMenuCategoryRow[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const bump = () => setStockTick((t) => t + 1)
    window.addEventListener('frontbill:fnb-raw-stock-changed', bump)
    window.addEventListener('frontbill:bar-stock-changed', bump)
    window.addEventListener('frontbill:supply-stock-changed', bump)
    window.addEventListener('frontbill:issue-out-log-changed', bump)
    window.addEventListener('frontbill:fnb-daily-changed', bump)
    window.addEventListener('frontbill:outlet-menu-synced', bump)
    return () => {
      window.removeEventListener('frontbill:fnb-raw-stock-changed', bump)
      window.removeEventListener('frontbill:bar-stock-changed', bump)
      window.removeEventListener('frontbill:supply-stock-changed', bump)
      window.removeEventListener('frontbill:issue-out-log-changed', bump)
      window.removeEventListener('frontbill:fnb-daily-changed', bump)
      window.removeEventListener('frontbill:outlet-menu-synced', bump)
    }
  }, [])

  const savedSheet = useMemo(
    () => fnbDailySheets.find((s) => s.date === ymd),
    [fnbDailySheets, ymd],
  )

  const ymdRef = useRef(ymd)

  useEffect(() => {
    void stockTick
    const dateChanged = ymdRef.current !== ymd
    ymdRef.current = ymd
    setLines((prev) =>
      seedFnbDailyLines(
        fnbRawStock ?? [],
        ymd,
        fnbDailySheets,
        issueOutLog,
        fnbMovements,
        dateChanged ? savedSheet?.lines : prev.length ? prev : savedSheet?.lines,
      ),
    )
  }, [ymd, fnbRawStock, fnbDailySheets, issueOutLog, fnbMovements, savedSheet, stockTick])

  const loadCategories = async () => {
    try {
      const rows = await fetchOutletCategories('main_bar')
      setCategories(rows)
    } catch {
      /* Auth/session races — Categories tab can retry on open. */
    }
  }

  useEffect(() => {
    if (!canManage || tab !== 'categories') return
    void loadCategories()
  }, [canManage, tab])

  const patchLine = (itemId: string, patch: Partial<FnbDailySheetLine>) => {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)))
  }

  const dailyRows = useMemo(() => {
    const byId = new Map((fnbRawStock ?? []).map((f) => [f.id, f]))
    return lines.flatMap((line) => {
      const item = byId.get(line.itemId)
      if (!item) return []
      return [
        {
          ...line,
          name: item.name,
          unit: item.unit,
          category: item.drinkCategoryName ?? '',
        },
      ]
    })
  }, [lines, fnbRawStock])

  const salesTotal = dailyRows.reduce((s, l) => s + fnbSheetAmount(l.soldQty, l.unitPrice), 0)

  const recentMoves = useMemo(
    () => (fnbMovements ?? []).slice(0, 20),
    [fnbMovements, stockTick],
  )

  const saveDaily = () => {
    const res = saveFnbDailySheet(ymd, lines, actor)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(`Daily inventory saved · ${res.stamp}`)
  }

  const moveToBar = async (fnbRawId: string) => {
    const qty = numOrZero(moveQty[fnbRawId] ?? '')
    const res = transferFnbToMainBar(fnbRawId, qty, actor, {
      notes: moveNote[fnbRawId]?.trim() || undefined,
    })
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setMoveQty((m) => ({ ...m, [fnbRawId]: '' }))
    setMoveNote((m) => ({ ...m, [fnbRawId]: '' }))
    const price = res.unitPrice > 0 ? res.unitPrice : 0
    const sync = await syncBarItemToMainBarMenu({
      itemName: res.itemName,
      categoryName: res.categoryName,
      barStockId: res.barStockId,
      unitPrice: price,
    })
    if (!sync.ok) {
      toast.warning(
        `Moved ${qty} ${res.unit} ${res.itemName} to Main Bar (${formatSupplyActorStamp(actor.name)}). Menu sync: ${sync.error}`,
      )
      return
    }
    toast.success(
      `Moved ${qty} ${res.unit} ${res.itemName} to Main Bar · ${formatSupplyActorStamp(actor.name)}`,
    )
  }

  const addCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await fetch('/api/outlets/menu/categories', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ department: 'main_bar', name }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not create category')
        return
      }
      toast.success(`Category “${name}” created · ${formatSupplyActorStamp(actor.name)}`)
      setNewCatName('')
      await loadCategories()
    } finally {
      setSaving(false)
    }
  }

  const seedCats = async () => {
    setSaving(true)
    try {
      const res = await seedDefaultDrinkCategories('main_bar')
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setCategories(res.categories)
      toast.success(
        res.created
          ? `Added ${res.created} drink categories · ${formatSupplyActorStamp(actor.name)}`
          : 'Default drink categories already exist',
      )
    } finally {
      setSaving(false)
    }
  }

  const assignCategory = async (fnbRawId: string, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId)
    const res = setFnbItemCategory(fnbRawId, categoryId === '__none__' ? '' : categoryId, cat?.name ?? '', actor)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    const item = (fnbRawStock ?? []).find((f) => f.id === fnbRawId)
    const bar = item ? (barStock ?? []).find((b) => b.storeItemId === item.storeItemId) : undefined
    if (item && bar && cat) {
      await syncBarItemToMainBarMenu({
        itemName: item.name,
        categoryName: cat.name,
        barStockId: bar.id,
        unitPrice: item.sellingPricePerPortion ?? 0,
      })
    }
    toast.success(
      cat
        ? `${item?.name ?? 'Item'} → ${cat.name} · ${formatSupplyActorStamp(actor.name)}`
        : `Category cleared · ${formatSupplyActorStamp(actor.name)}`,
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="F&B Store"
        description="Daily drinks ledger (Opening → Closing). Issue from Central Store into F&B Store, then move stock to Main Bar. Main Bar POS availability comes from what you transfer here — same idea as kitchen → restaurant."
      />

      <p className="text-sm text-muted-foreground rounded-xl border bg-muted/30 px-3 py-2">
        Flow: <strong>Central Store</strong> → <strong>F&B Store</strong> → <strong>Main Bar</strong>.
        Only F&B, Admin, Manager, or Superadmin can move stock to Main Bar. Every save and transfer
        is stamped with your name, date, and time.
      </p>

      {!canManage && (
        <p className="text-sm text-muted-foreground rounded-xl border px-3 py-2">
          View only. F&B, Admin, Manager, or Superadmin can record inventory and transfer to Main Bar.
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} className="gap-2">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="daily" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Daily inventory
          </TabsTrigger>
          <TabsTrigger value="transfer" className="gap-1.5">
            <Wine className="h-3.5 w-3.5" />
            Transfer to Main Bar
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5">
            <FolderTree className="h-3.5 w-3.5" />
            Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="fnb-sheet-date">Sheet date</Label>
              <Input
                id="fnb-sheet-date"
                type="date"
                className="h-8 w-44"
                value={ymd}
                onChange={(e) => setYmd(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {savedSheet
                ? `Last saved by ${formatSupplyActorStamp(savedSheet.savedBy, savedSheet.savedAt)}`
                : 'Not saved yet today'}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm tabular-nums text-muted-foreground">
                Sales total {formatNaira(salesTotal)}
              </span>
              <Button size="sm" disabled={!canManage || lines.length === 0} onClick={saveDaily}>
                Save daily sheet
              </Button>
            </div>
          </div>

          {(fnbRawStock ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-xl border p-8 text-center">
              No F&amp;B stock yet. From Central Store, issue drinks to <strong>F&amp;B Store</strong>{' '}
              (not directly to Main Bar). They appear here as Opening / New.
            </p>
          ) : (
            <PaginatedListShell
              items={dailyRows}
              pageSize={15}
              resetKey={ymd}
              searchPlaceholder="Search item, category, compliment note…"
              searchMatch={(row, query) => {
                const q = query.trim().toLowerCase()
                return (
                  row.name.toLowerCase().includes(q) ||
                  row.unit.toLowerCase().includes(q) ||
                  row.category.toLowerCase().includes(q) ||
                  (row.complimentaryNote ?? '').toLowerCase().includes(q)
                )
              }}
              emptyMessage="No items match your search."
            >
              {(pageRows) => (
                <div className="rounded-xl border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">New</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Compliments</TableHead>
                        <TableHead className={RESPONSIVE_HIDE_MD}>Compliment note</TableHead>
                        <TableHead className="text-right">Qty sold</TableHead>
                        <TableHead className="text-right">Unit price</TableHead>
                        <TableHead className={`text-right ${RESPONSIVE_HIDE_MD}`}>Amount</TableHead>
                        <TableHead className="text-right">Damage</TableHead>
                        <TableHead className={`text-right ${RESPONSIVE_HIDE_LG}`}>To Main Bar</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((line) => {
                        const total = Math.max(0, line.opening) + Math.max(0, line.newQty)
                        const amount = fnbSheetAmount(line.soldQty, line.unitPrice)
                        const closing = fnbSheetClosing(line)
                        return (
                          <TableRow key={line.itemId}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {line.name}
                              <span className="block text-[10px] text-muted-foreground font-normal">
                                {line.unit}
                                {line.category ? ` · ${line.category}` : ''}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                disabled={!canManage}
                                className="h-7 w-16 ml-auto text-right"
                                value={line.opening || ''}
                                onChange={(e) =>
                                  patchLine(line.itemId, { opening: numOrZero(e.target.value) })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {line.newQty}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{total}</TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                disabled={!canManage}
                                className="h-7 w-16 ml-auto text-right"
                                value={line.complimentary || ''}
                                onChange={(e) =>
                                  patchLine(line.itemId, { complimentary: numOrZero(e.target.value) })
                                }
                              />
                            </TableCell>
                            <TableCell className={RESPONSIVE_HIDE_MD}>
                              <Input
                                disabled={!canManage}
                                className="h-7 min-w-[7rem]"
                                placeholder="Board Room, Director…"
                                value={line.complimentaryNote ?? ''}
                                onChange={(e) =>
                                  patchLine(line.itemId, { complimentaryNote: e.target.value })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                disabled={!canManage}
                                className="h-7 w-16 ml-auto text-right"
                                value={line.soldQty || ''}
                                onChange={(e) =>
                                  patchLine(line.itemId, { soldQty: numOrZero(e.target.value) })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                disabled={!canManage}
                                className="h-7 w-20 ml-auto text-right"
                                value={line.unitPrice || ''}
                                onChange={(e) =>
                                  patchLine(line.itemId, { unitPrice: numOrZero(e.target.value) })
                                }
                              />
                            </TableCell>
                            <TableCell className={`text-right tabular-nums ${RESPONSIVE_HIDE_MD}`}>
                              {amount ? formatNaira(amount) : '—'}
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                disabled={!canManage}
                                className="h-7 w-16 ml-auto text-right"
                                value={line.damage || ''}
                                onChange={(e) =>
                                  patchLine(line.itemId, { damage: numOrZero(e.target.value) })
                                }
                              />
                            </TableCell>
                            <TableCell className={`text-right tabular-nums ${RESPONSIVE_HIDE_LG}`}>
                              {line.toMainBar}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{closing}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </PaginatedListShell>
          )}
        </TabsContent>

        <TabsContent value="transfer" className="space-y-4">
          {(fnbRawStock ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-xl border p-8 text-center">
              Nothing to move. Issue items from Central Store to <strong>F&amp;B Store</strong> first.
            </p>
          ) : (
            <PaginatedListShell
              items={fnbRawStock ?? []}
              pageSize={15}
              searchPlaceholder="Search item or category…"
              searchMatch={(item, query) => {
                const q = query.trim().toLowerCase()
                return (
                  item.name.toLowerCase().includes(q) ||
                  item.unit.toLowerCase().includes(q) ||
                  (item.drinkCategoryName ?? '').toLowerCase().includes(q)
                )
              }}
              emptyMessage="No items match your search."
            >
              {(pageItems) => (
                <div className="rounded-xl border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">F&amp;B on hand</TableHead>
                        <TableHead className={`text-right ${RESPONSIVE_HIDE_MD}`}>At Main Bar</TableHead>
                        <TableHead className="text-right">Move qty</TableHead>
                        <TableHead className={RESPONSIVE_HIDE_MD}>Note</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageItems.map((item) => {
                        const atBar =
                          (barStock ?? []).find((b) => b.storeItemId === item.storeItemId)
                            ?.quantityOnHand ?? 0
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.name}
                              <span className="block text-[10px] text-muted-foreground font-normal">
                                {item.unit}
                                {item.drinkCategoryName ? ` · ${item.drinkCategoryName}` : ''}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {item.quantityOnHand} {item.unit}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums ${RESPONSIVE_HIDE_MD}`}>
                              {atBar} {item.unit}
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                disabled={!canManage}
                                className="h-8 w-20 ml-auto text-right"
                                placeholder="Qty"
                                value={moveQty[item.id] ?? ''}
                                onChange={(e) =>
                                  setMoveQty((m) => ({ ...m, [item.id]: e.target.value }))
                                }
                              />
                            </TableCell>
                            <TableCell className={RESPONSIVE_HIDE_MD}>
                              <Input
                                disabled={!canManage}
                                className="h-8 min-w-[8rem]"
                                placeholder="Optional note"
                                value={moveNote[item.id] ?? ''}
                                onChange={(e) =>
                                  setMoveNote((m) => ({ ...m, [item.id]: e.target.value }))
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                disabled={!canManage || !numOrZero(moveQty[item.id] ?? '')}
                                onClick={() => void moveToBar(item.id)}
                              >
                                Move to Main Bar
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </PaginatedListShell>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent F&amp;B movements</CardTitle>
              <CardDescription>Each line shows who moved stock, and when.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentMoves.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfers or sheet adjustments yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {recentMoves.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-0">
                      <span>
                        <Badge variant="outline" className="mr-1.5 text-[10px]">
                          {m.kind === 'to_main_bar'
                            ? 'Main Bar'
                            : m.kind === 'complimentary'
                              ? 'Compliment'
                              : m.kind}
                        </Badge>
                        {m.quantity} {m.unit} {m.itemName}
                        {m.note ? <span className="text-muted-foreground"> · {m.note}</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatSupplyActorStamp(m.actorName, m.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drink categories</CardTitle>
              <CardDescription>
                Categories are shared with the Main Bar menu tab (Wine, Soft Drink, Cocktail, …).
                Created by F&amp;B, Admin, Manager, or Superadmin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="New category (e.g. Wine)"
                    className="max-w-xs"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void addCategory()}
                  />
                  <Button type="button" disabled={saving || !newCatName.trim()} onClick={() => void addCategory()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                  <Button type="button" variant="outline" disabled={saving} onClick={() => void seedCats()}>
                    Add default categories
                  </Button>
                </div>
              )}
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No categories yet. Add Wine, Champagne, Spirits, Beer, Soft Drink, Cocktail, Malt, and Water
                  — or type your own.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <Badge key={c.id} variant="secondary">
                      {c.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assign items</CardTitle>
              <CardDescription>
                Put each F&amp;B Store drink in a category so Main Bar menu and POS group the same way.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(fnbRawStock ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No F&amp;B items to categorise yet.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fnbRawStock ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Select
                              disabled={!canManage}
                              value={item.drinkCategoryId || '__none__'}
                              onValueChange={(v) => void assignCategory(item.id, v)}
                            >
                              <SelectTrigger className="h-8 max-w-xs">
                                <SelectValue placeholder="Uncategorized" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Uncategorized</SelectItem>
                                {categories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
