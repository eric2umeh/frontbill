'use client'

import { useEffect, useMemo, useState } from 'react'
import { useClientMounted } from '@/hooks/use-client-mounted'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { DEPT_LABELS, STORE_DEPT_PICKER_OPTIONS, isBarStoreDept, storeItemDepartments, storeItemMatchesDept, type SupplyDept } from '@/lib/supply-chain/types'
import { priceVariancePct } from '@/lib/supply-chain/calculations'
import { DeptPill } from '@/lib/supply-chain/supply-ui'
import { formatNaira } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import {
  canonicalRoleKey,
  canAddStoreItemDirect,
  canApproveStoreItems,
  canIssueStockFromStore,
  canManageStoreCatalog,
  canSubmitStoreItemForApproval,
} from '@/lib/permissions'
import { issueOutletPickerOptions } from '@/lib/store/outlet-departments'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowRightFromLine, History, Pencil, Trash2 } from 'lucide-react'
import { OrgStaffSearchField } from '@/components/shared/org-staff-search-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import {
  getStockLevel,
  stockLevelBadgeClass,
  stockLevelNumberPillClass,
  stockLevelStatusLabel,
} from '@/lib/supply-chain/stock-level-ui'
import { DraftBasketSidebar } from '@/components/supply-chain/draft-basket-sidebar'
import { PoHistoryPanel } from '@/components/supply-chain/po-history-panel'
import { ActivePurchaseOrderPanel } from '@/components/supply-chain/active-purchase-order-panel'
import { canEditStorePurchaseOrder } from '@/lib/supply-chain/po-active'
import { RESPONSIVE_HIDE_MD, RESPONSIVE_HIDE_LG } from '@/lib/ui/responsive-table'
import {
  defaultUnitForStoreItem,
  formatUnitLabel,
  isCompleteQuantityInput,
  parseQuantityValue,
  sanitizeQuantityInput,
} from '@/lib/supply-chain/measurement-units'
import { handleSupplyActionError } from '@/lib/supply-chain/handle-supply-action-error'
import {
  convertToStoreUnitsWithFactors,
  mergeUnitFactors,
  needsUnitFactor,
} from '@/lib/supply-chain/unit-factor-storage'
import { purchaseUnitPriceFromStorePrice } from '@/lib/supply-chain/purchase-unit-pricing'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { UnitConversionField } from '@/components/supply-chain/unit-conversion-field'
import type { IssueOutCartLine, StoreItem } from '@/lib/supply-chain/types'
import { StoreAddItemDialog } from '@/components/supply-chain/store-add-item-dialog'
import { StoreEditItemDialog } from '@/components/supply-chain/store-edit-item-dialog'
import { IssueOutCartSidebar } from '@/components/supply-chain/issue-out-cart-sidebar'
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

const DEPTS: SupplyDept[] = ['all', ...STORE_DEPT_PICKER_OPTIONS]

const ISSUE_DESTINATIONS = issueOutletPickerOptions()

const numberInputValue = (value: number | null | undefined) =>
  value != null && Number(value) !== 0 ? String(value) : ''

export function StoreWorkspace() {
  const { name, role, userId } = useAuth()
  const {
    storeItems,
    basket,
    setBasketLineQty,
    removeFromBasket,
    clearBasket,
    activePurchaseOrder,
    purchaseOrders,
    stats,
    pendingStoreItems,
    issueFromStoreToDepartment,
    issueOutCart,
    issueOutLog,
    barStock,
    addStoreItemDirect,
    updateStoreItemDirect,
    deleteStoreItemDirect,
    submitStoreItemForApproval,
    approvePendingStoreItem,
    rejectPendingStoreItem,
  } = useSupplyChain()
  const [dept, setDept] = useState<SupplyDept>('all')
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [issueQtyMap, setIssueQtyMap] = useState<Record<string, string>>({})
  const [issueUnitMap, setIssueUnitMap] = useState<Record<string, string>>({})
  const [purchaseUnitMap, setPurchaseUnitMap] = useState<Record<string, string>>({})
  const [purchasePriceMap, setPurchasePriceMap] = useState<Record<string, string>>({})
  const [factorMap, setFactorMap] = useState<Record<string, Record<string, number>>>({})

  const factorsFor = (item: StoreItem) =>
    factorMap[item.id] ?? mergeUnitFactors(item.id, item.unit, item.unitFactors)

  const toStoreQty = (item: StoreItem, qty: number, unit: string): number | null =>
    convertToStoreUnitsWithFactors(qty, unit, item.unit, factorsFor(item))
  const [issueDestination, setIssueDestination] = useState('')
  const [issueReceivedBy, setIssueReceivedBy] = useState('')
  const [issueReceivedById, setIssueReceivedById] = useState<string | null>(null)
  const [issueNotes, setIssueNotes] = useState('')
  const [issueCart, setIssueCart] = useState<IssueOutCartLine[]>([])
  const [issuingCart, setIssuingCart] = useState(false)
  const mounted = useClientMounted()
  const [tab, setTab] = useState('stock')
  const [editItem, setEditItem] = useState<StoreItem | null>(null)
  const [stockQtyMap, setStockQtyMap] = useState<Record<string, string>>({})
  const canIssue = canIssueStockFromStore(role)
  const canAddDirect = canAddStoreItemDirect(role)
  const canManageCatalog = canManageStoreCatalog(role)
  const canSubmitItem = canSubmitStoreItemForApproval(role)
  const canApproveItems = canApproveStoreItems(role)
  const pendingApprovals = (pendingStoreItems ?? []).filter((p) => p.status === 'pending')
  const purchaseLocked = Boolean(
    activePurchaseOrder && !canEditStorePurchaseOrder(activePurchaseOrder),
  )

  const filtered = useMemo(() => {
    const list =
      dept === 'all' ? storeItems : storeItems.filter((s) => storeItemMatchesDept(s, dept))
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
    )
  }, [storeItems, dept])

  const basketByDept = useMemo(() => {
    const m = new Map<string, typeof basket>()
    for (const b of basket) {
      if (!m.has(b.dept)) m.set(b.dept, [])
      m.get(b.dept)!.push(b)
    }
    return m
  }, [basket])

  const deptCatalogCounts = useMemo(() => {
    const c: Partial<Record<SupplyDept, number>> = {}
    for (const item of storeItems) {
      for (const d of storeItemDepartments(item)) {
        c[d] = (c[d] ?? 0) + 1
      }
    }
    return c
  }, [storeItems])

  const actor = { name: name ?? 'Store', role: canonicalRoleKey(role) ?? 'store' }

  const unitLabel = (unit: string) => formatUnitLabel(unit)

  const commitStockQty = (item: StoreItem, raw: string) => {
    const qty = parseQuantityValue(raw)
    if (qty < 0) {
      toast.error('Enter a valid quantity')
      setStockQtyMap((m) => ({ ...m, [item.id]: String(item.quantityInStore) }))
      return
    }
    const res = updateStoreItemDirect(item.id, { quantityInStore: qty }, actor)
    if ('error' in res) {
      toast.error(res.error)
      setStockQtyMap((m) => ({ ...m, [item.id]: String(item.quantityInStore) }))
      return
    }
    toast.success(`Updated ${item.name} to ${qty} ${unitLabel(item.unit)}`)
  }

  useEffect(() => {
    setQtyMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const b of basket) {
        if (!(b.stockItemId in next)) {
          next[b.stockItemId] = String(b.qtyToBuy)
          changed = true
        }
      }
      return changed ? next : prev
    })
    setPurchaseUnitMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const b of basket) {
        if (b.unit && next[b.stockItemId] !== b.unit) {
          next[b.stockItemId] = b.unit
          changed = true
        }
      }
      return changed ? next : prev
    })
    setPurchasePriceMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const b of basket) {
        if (Number.isFinite(b.unitPrice) && b.unitPrice > 0 && !(b.stockItemId in next)) {
          next[b.stockItemId] = String(b.unitPrice)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [basket])

  const commitPurchaseQty = (item: StoreItem, raw: string, unitOverride?: string) => {
    const trimmed = raw.trim()
    const purchaseUnit = unitOverride ?? purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
    if (!trimmed) {
      const res = removeFromBasket(item.id)
      if (res && 'error' in res) toast.error(res.error)
      else {
        setQtyMap((m) => {
          const next = { ...m }
          delete next[item.id]
          return next
        })
      }
      return
    }
    const qty = parseQuantityValue(trimmed)
    if (qty <= 0) return
    const storeQty = toStoreQty(item, qty, purchaseUnit)
    if (storeQty == null) {
      toast.error(`Set pack size for ${item.name} (${unitLabel(purchaseUnit)} per ${unitLabel(item.unit)})`)
      return
    }
    const factors = factorsFor(item)
    const defaultPurchasePrice = purchaseUnitPriceFromStorePrice(
      item.lastPrice,
      purchaseUnit,
      item.unit,
      factors,
    )
    const purchaseUnitPrice =
      Number(purchasePriceMap[item.id]) > 0
        ? Number(purchasePriceMap[item.id])
        : defaultPurchasePrice
    const storeUnitPrice = item.lastPrice
    const err = setBasketLineQty(item, storeQty, storeUnitPrice, actor, {
      purchaseUnit,
      purchaseQty: qty,
      purchaseUnitPrice,
      storeQty,
      storeUnitPrice,
    })
    if (err) toast.error(err)
  }

  const handlePurchaseQtyChange = (item: StoreItem, raw: string) => {
    const cleaned = sanitizeQuantityInput(raw)
    setQtyMap((m) => ({ ...m, [item.id]: cleaned }))
    if (!purchaseUnitMap[item.id]) {
      setPurchaseUnitMap((m) => ({
        ...m,
        [item.id]: defaultUnitForStoreItem(item.unit),
      }))
    }
    if (isCompleteQuantityInput(cleaned)) {
      commitPurchaseQty(item, cleaned)
    }
  }

  const handleClearBasket = () => {
    const res = clearBasket()
    if (res && 'error' in res) {
      toast.error(res.error)
      return
    }
    setQtyMap({})
    setPurchaseUnitMap({})
    setPurchasePriceMap({})
  }

  const handleRemoveFromBasket = (stockItemId: string) => {
    const res = removeFromBasket(stockItemId)
    if (res && 'error' in res) {
      toast.error(res.error)
      return
    }
    setQtyMap((m) => {
      const next = { ...m }
      delete next[stockItemId]
      return next
    })
    setPurchaseUnitMap((m) => {
      const next = { ...m }
      delete next[stockItemId]
      return next
    })
    setPurchasePriceMap((m) => {
      const next = { ...m }
      delete next[stockItemId]
      return next
    })
  }

  const handleBasketQtyChange = (stockItemId: string, qty: number) => {
    const item = storeItems.find((s) => s.id === stockItemId)
    if (!item) return
    if (qty <= 0) {
      handleRemoveFromBasket(stockItemId)
      return
    }
    setQtyMap((m) => ({ ...m, [stockItemId]: String(qty) }))
    const existing = basket.find((b) => b.stockItemId === stockItemId)
    const storeQty =
      existing?.storeQtyToBuy && existing.qtyToBuy > 0
        ? (qty / existing.qtyToBuy) * existing.storeQtyToBuy
        : qty
    const purchaseUnitPrice = existing?.unitPrice ?? item.lastPrice
    const storeUnitPrice =
      existing?.storeUnitPrice ??
      (storeQty > 0 ? (qty * purchaseUnitPrice) / storeQty : item.lastPrice)
    const err = setBasketLineQty(item, storeQty, storeUnitPrice, actor, {
      purchaseUnit: existing?.unit ?? item.unit,
      purchaseQty: qty,
      purchaseUnitPrice,
      storeQty,
      storeUnitPrice,
    })
    if (err) toast.error(err)
  }

  const addToIssueCart = (item: StoreItem, rawQty: string, unit?: string) => {
    const issueUnit = unit ?? issueUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
    const qty = Number(rawQty)
    if (!Number.isFinite(qty) || qty <= 0) {
      setIssueCart((prev) => prev.filter((l) => l.storeItemId !== item.id))
      return
    }
    const storeQty = toStoreQty(item, qty, issueUnit)
    if (storeQty == null) return
    if (storeQty > item.quantityInStore) {
      toast.error(`Only ${item.quantityInStore} ${unitLabel(item.unit)} on hand`)
      return
    }
    setIssueCart((prev) => {
      const ex = prev.find((l) => l.storeItemId === item.id)
      const line: IssueOutCartLine = {
        storeItemId: item.id,
        name: item.name,
        unit: issueUnit,
        storeUnit: item.unit,
        dept: item.dept,
        quantity: qty,
        maxAvailable: item.quantityInStore,
      }
      if (ex) return prev.map((l) => (l.storeItemId === item.id ? line : l))
      return [...prev, line]
    })
  }

  const handleCommitIssueCart = () => {
    if (!issueDestination.trim()) {
      toast.error('Select a destination')
      return
    }
    if (!issueReceivedBy.trim()) {
      toast.error('Received by is required')
      return
    }
    setIssuingCart(true)
    const res = issueOutCart(issueCart, issueDestination, actor, {
      receivedBy: issueReceivedBy,
      receivedById: issueReceivedById ?? undefined,
      notes: issueNotes,
    })
    setIssuingCart(false)
    if ('error' in res) {
      handleSupplyActionError(res, {
        title: 'Cannot issue — stock short',
        fallbackMessage: 'The following central store items are short. Reduce quantities or receive stock first.',
      })
      return
    }
    toast.success(`Issued ${res.issued} item(s) to ${issueDestination}`)
    setIssueCart([])
    setIssueQtyMap({})
    setIssueUnitMap({})
  }

  const basketSidebar = (
    <DraftBasketSidebar
      basket={basket}
      basketByDept={basketByDept}
      total={stats.basketTotal}
      readOnly={purchaseLocked}
      onClear={handleClearBasket}
      onRemove={handleRemoveFromBasket}
      onQtyChange={handleBasketQtyChange}
      sendLabel="Send to accountant"
    />
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central Store</h1>
        <p className="text-sm text-muted-foreground">Stock levels, dept purchase lists & master PO</p>
      </div>

      {!mounted ? (
        <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          {canIssue && (
            <>
              <TabsTrigger value="issue_out" className="gap-1.5">
                <ArrowRightFromLine className="h-3.5 w-3.5" />
                Issue Out
              </TabsTrigger>
              <TabsTrigger value="issue_out_log" className="gap-1.5">
                <History className="h-3.5 w-3.5" />
                Issue Out Log
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="purchase">Raise Purchase Request</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-3 overflow-visible pt-3">
          {DEPTS.map((d) => (
            <DeptPill
              key={d}
              dept={d}
              label={DEPT_LABELS[d]}
              active={dept === d}
              count={d === 'all' ? storeItems.length : deptCatalogCounts[d]}
              onClick={() => setDept(d)}
            />
          ))}
        </div>

        <TabsContent value="stock" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <StoreAddItemDialog
              canAddDirect={canAddDirect}
              canSubmit={canSubmitItem}
              onAddDirect={(input) => {
                const res = addStoreItemDirect(input, actor)
                if ('error' in res) {
                  toast.error(res.error)
                  return res
                }
                toast.success(`Added ${input.name} to central store`)
                return { ok: true as const }
              }}
              onSubmitForApproval={(input) => {
                if (!userId) {
                  toast.error('Sign in to submit items')
                  return { error: 'Not signed in' }
                }
                const res = submitStoreItemForApproval(
                  {
                    ...input,
                    submittedBy: userId,
                    submittedByName: name ?? 'Store',
                  },
                  actor,
                )
                if ('error' in res) {
                  toast.error(res.error)
                  return res
                }
                toast.success('Submitted for admin approval')
                return { ok: true as const }
              }}
            />
          </div>

          {canApproveItems && pendingApprovals.length > 0 && (
            <div className="rounded-xl border p-4 space-y-3 bg-amber-50/40">
              <h3 className="font-semibold text-sm">Pending store item approvals</h3>
              <ul className="space-y-2">
                {pendingApprovals.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {unitLabel(p.unit)} ·{' '}
                        {storeItemDepartments(p)
                          .map((d) => DEPT_LABELS[d])
                          .join(', ')}{' '}
                        · ₦{p.lastPrice} · qty {p.quantityInStore}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        By {p.submittedByName} · {new Date(p.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          const res = approvePendingStoreItem(p.id, actor)
                          if ('error' in res) toast.error(res.error)
                          else toast.success(`Approved ${p.name}`)
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const res = rejectPendingStoreItem(p.id, actor)
                          if ('error' in res) toast.error(res.error)
                          else toast.info(`Rejected ${p.name}`)
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                  <>
                    <div className="md:hidden space-y-2">
                      {pageItems.map((item) => {
                        const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                        return (
                          <div key={item.id} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm leading-snug">
                                  {item.name} ({unitLabel(item.unit)})
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {storeItemDepartments(item).map((d) => (
                                    <Badge key={d} variant="secondary" className="text-[10px]">
                                      {DEPT_LABELS[d]}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <Badge className={stockLevelBadgeClass(level)}>
                                {stockLevelStatusLabel(level)}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-muted-foreground">In store</span>
                              {canManageCatalog ? (
                                <Input
                                  inputMode="decimal"
                                  className="h-8 w-28 text-right tabular-nums"
                                  value={stockQtyMap[item.id] ?? numberInputValue(item.quantityInStore)}
                                  onChange={(e) =>
                                    setStockQtyMap((m) => ({
                                      ...m,
                                      [item.id]: sanitizeQuantityInput(e.target.value),
                                    }))
                                  }
                                  onBlur={(e) => commitStockQty(item, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur()
                                  }}
                                />
                              ) : (
                                <span className={stockLevelNumberPillClass(level)}>
                                  {item.quantityInStore} {unitLabel(item.unit)}
                                </span>
                              )}
                            </div>
                            {canManageCatalog && (
                              <div className="flex justify-end gap-1 border-t pt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1"
                                  onClick={() => setEditItem(item)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Removes this item from the central store catalogue on this
                                        device. Purchase and issue history are kept.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => {
                                          const res = deleteStoreItemDirect(item.id, actor)
                                          if ('error' in res) toast.error(res.error)
                                          else toast.success(`Deleted ${item.name}`)
                                        }}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className={RESPONSIVE_HIDE_MD}>Dept</TableHead>
                            <TableHead className="text-right">In Store</TableHead>
                            <TableHead className={`text-right ${RESPONSIVE_HIDE_LG}`}>Reorder</TableHead>
                            <TableHead className={`text-right ${RESPONSIVE_HIDE_MD}`}>Last Price</TableHead>
                            <TableHead className={`text-right ${RESPONSIVE_HIDE_LG}`}>Benchmark</TableHead>
                            <TableHead className={`text-right ${RESPONSIVE_HIDE_LG}`}>Variance</TableHead>
                            <TableHead>Status</TableHead>
                            {canManageCatalog && (
                              <TableHead className="w-24 text-right">Actions</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageItems.map((item) => {
                            const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                            const varPct = priceVariancePct(item.lastPrice, item.benchmarkPrice)
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                  {item.name} ({unitLabel(item.unit)})
                                </TableCell>
                                <TableCell className={RESPONSIVE_HIDE_MD}>
                                  <div className="flex flex-wrap gap-1">
                                    {storeItemDepartments(item).map((d) => (
                                      <Badge key={d} variant="secondary" className="text-[10px]">
                                        {DEPT_LABELS[d]}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {canManageCatalog ? (
                                    <Input
                                      inputMode="decimal"
                                      className="h-8 w-24 ml-auto text-right tabular-nums"
                                      value={
                                        stockQtyMap[item.id] ?? numberInputValue(item.quantityInStore)
                                      }
                                      onChange={(e) =>
                                        setStockQtyMap((m) => ({
                                          ...m,
                                          [item.id]: sanitizeQuantityInput(e.target.value),
                                        }))
                                      }
                                      onBlur={(e) => commitStockQty(item, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur()
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span className={stockLevelNumberPillClass(level)}>
                                      {item.quantityInStore} {unitLabel(item.unit)}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className={`text-right tabular-nums ${RESPONSIVE_HIDE_LG}`}>
                                  {item.reorderLevel}
                                </TableCell>
                                <TableCell className={`text-right ${RESPONSIVE_HIDE_MD}`}>
                                  {formatNaira(item.lastPrice)}
                                </TableCell>
                                <TableCell className={`text-right ${RESPONSIVE_HIDE_LG}`}>
                                  {formatNaira(item.benchmarkPrice)}
                                </TableCell>
                                <TableCell className={`text-right text-emerald-600 ${RESPONSIVE_HIDE_LG}`}>
                                  {varPct.toFixed(1)}%
                                </TableCell>
                                <TableCell>
                                  <Badge className={stockLevelBadgeClass(level)}>
                                    {stockLevelStatusLabel(level)}
                                  </Badge>
                                </TableCell>
                                {canManageCatalog && (
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        title="Edit item"
                                        onClick={() => setEditItem(item)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                            title="Delete item"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Removes this item from the central store catalogue on
                                              this device. Purchase and issue history are kept.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => {
                                                const res = deleteStoreItemDirect(item.id, actor)
                                                if ('error' in res) toast.error(res.error)
                                                else toast.success(`Deleted ${item.name}`)
                                              }}
                                            >
                                              Delete
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </PaginatedListShell>
            </div>
          </div>
          <StoreEditItemDialog
            item={editItem}
            open={!!editItem}
            onOpenChange={(open) => {
              if (!open) setEditItem(null)
            }}
            onSave={(input) => {
              if (!editItem) return { error: 'No item selected' }
              const res = updateStoreItemDirect(editItem.id, input, actor)
              if ('error' in res) {
                toast.error(res.error)
                return res
              }
              toast.success(`Updated ${input.name}`)
              return { ok: true as const }
            }}
          />
        </TabsContent>

        {canIssue && (
          <TabsContent value="issue_out" className="mt-4 space-y-4">
            <div className="rounded-xl border p-4 space-y-4 bg-muted/20">
              <div>
                <h3 className="font-semibold text-sm">Issue out to department / outlet</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Add quantities to the issue cart, review on the right, then issue in one step.
                  Received by is required. Bar items to Restaurant credit F&amp;B raw stock.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="issue-destination">Destination *</Label>
                  <Select value={issueDestination} onValueChange={setIssueDestination}>
                    <SelectTrigger id="issue-destination">
                      <SelectValue placeholder="Select department or outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_DESTINATIONS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {userId ? (
                  <OrgStaffSearchField
                    callerId={userId}
                    id="issue-received-by"
                    label="Received by *"
                    placeholder="Search staff…"
                    value={issueReceivedBy}
                    staffId={issueReceivedById}
                    onChange={(n, id) => {
                      setIssueReceivedBy(n)
                      setIssueReceivedById(id)
                    }}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="issue-received-by">Received by *</Label>
                    <Input
                      id="issue-received-by"
                      placeholder="Name (required)"
                      required
                      value={issueReceivedBy}
                      onChange={(e) => setIssueReceivedBy(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="issue-notes">Notes</Label>
                  <Input
                    id="issue-notes"
                    placeholder="Reference / remarks (optional)"
                    value={issueNotes}
                    onChange={(e) => setIssueNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="rounded-xl border overflow-hidden">
              <div className="border-b px-4 py-2 bg-muted/30 text-sm font-medium">
                Items to issue — enter qty to add to cart
              </div>
              <div className="p-3">
                <PaginatedListShell
                  items={filtered}
                  pageSize={15}
                  searchPlaceholder="Search items to issue…"
                  searchKeys={['name', 'dept']}
                  emptyMessage="No items match your filters."
                >
                  {(pageItems) => (
                    <>
                      <div className="md:hidden space-y-2">
                        {pageItems.map((item) => {
                          const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                          return (
                            <div key={item.id} className="rounded-lg border p-3 space-y-2">
                              <div>
                                <p className="font-medium text-sm">
                                  {item.name} ({unitLabel(item.unit)})
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {storeItemDepartments(item).map((d) => (
                                    <Badge key={d} variant="secondary" className="text-[10px]">
                                      {DEPT_LABELS[d]}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">In store</span>
                                <span className={stockLevelNumberPillClass(level)}>
                                  {item.quantityInStore} {unitLabel(item.unit)}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  inputMode="decimal"
                                  className="h-8 w-24 text-right"
                                  value={issueQtyMap[item.id] ?? ''}
                                  onChange={(e) => {
                                    const v = sanitizeQuantityInput(e.target.value)
                                    setIssueQtyMap((m) => ({ ...m, [item.id]: v }))
                                    const u =
                                      issueUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
                                    addToIssueCart(item, v, u)
                                  }}
                                />
                                <UnitSelect
                                  storeUnit={item.unit}
                                  itemName={item.name}
                                  value={
                                    issueUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
                                  }
                                  onChange={(u) => {
                                    setIssueUnitMap((m) => ({ ...m, [item.id]: u }))
                                    const v = issueQtyMap[item.id] ?? ''
                                    if (v) addToIssueCart(item, v, u)
                                  }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead className={RESPONSIVE_HIDE_MD}>Dept</TableHead>
                              <TableHead className="text-right">In Store</TableHead>
                              <TableHead className="text-right">Qty / unit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pageItems.map((item) => {
                              const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                              const onBar =
                                isBarStoreDept(item.dept)
                                  ? barStock.find((b) => b.storeItemId === item.id)
                                  : undefined
                              return (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <p className="font-medium">{item.name} ({unitLabel(item.unit)})</p>
                                    {onBar != null && (
                                      <p className="text-xs text-muted-foreground">
                                        Bar stock: {onBar.quantityOnHand} {unitLabel(item.unit)}
                                      </p>
                                    )}
                                  </TableCell>
                                  <TableCell className={RESPONSIVE_HIDE_MD}>
                                    <div className="flex flex-wrap gap-1">
                                      {storeItemDepartments(item).map((d) => (
                                        <Badge key={d} variant="secondary" className="text-[10px]">
                                          {DEPT_LABELS[d]}
                                        </Badge>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={stockLevelNumberPillClass(level)}>
                                      {item.quantityInStore} {unitLabel(item.unit)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Input
                                        inputMode="decimal"
                                        className="h-8 w-20 text-right"
                                        value={issueQtyMap[item.id] ?? ''}
                                        onChange={(e) => {
                                          const v = sanitizeQuantityInput(e.target.value)
                                          setIssueQtyMap((m) => ({ ...m, [item.id]: v }))
                                          const u =
                                            issueUnitMap[item.id] ??
                                            defaultUnitForStoreItem(item.unit)
                                          addToIssueCart(item, v, u)
                                        }}
                                      />
                                      <UnitSelect
                                        storeUnit={item.unit}
                                        itemName={item.name}
                                        value={
                                          issueUnitMap[item.id] ??
                                          defaultUnitForStoreItem(item.unit)
                                        }
                                        onChange={(u) => {
                                          setIssueUnitMap((m) => ({ ...m, [item.id]: u }))
                                          const v = issueQtyMap[item.id] ?? ''
                                          if (v) addToIssueCart(item, v, u)
                                        }}
                                      />
                                    </div>
                                    {needsUnitFactor(
                                      issueUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit),
                                      item.unit,
                                      factorsFor(item),
                                    ) && (
                                      <UnitConversionField
                                        compact
                                        storeItemId={item.id}
                                        storeUnit={item.unit}
                                        selectedUnit={
                                          issueUnitMap[item.id] ??
                                          defaultUnitForStoreItem(item.unit)
                                        }
                                        factors={factorsFor(item)}
                                        onFactorsChange={(next) => {
                                          setFactorMap((m) => ({ ...m, [item.id]: next }))
                                          updateStoreItemDirect(item.id, { unitFactors: next }, actor)
                                          const v = issueQtyMap[item.id] ?? ''
                                          const u =
                                            issueUnitMap[item.id] ??
                                            defaultUnitForStoreItem(item.unit)
                                          if (v) addToIssueCart(item, v, u)
                                        }}
                                      />
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </PaginatedListShell>
              </div>
            </div>
            <IssueOutCartSidebar
              cart={issueCart}
              destination={issueDestination}
              receivedBy={issueReceivedBy}
              committing={issuingCart}
              onClear={() => {
                setIssueCart([])
                setIssueQtyMap({})
                setIssueUnitMap({})
              }}
              onRemove={(id) => {
                setIssueCart((prev) => prev.filter((l) => l.storeItemId !== id))
                setIssueQtyMap((m) => ({ ...m, [id]: '' }))
              }}
              onQtyChange={(id, qty) => {
                const item = storeItems.find((s) => s.id === id)
                if (!item) return
                const line = issueCart.find((l) => l.storeItemId === id)
                const issueUnit = line?.unit ?? issueUnitMap[id] ?? defaultUnitForStoreItem(item.unit)
                if (qty <= 0) {
                  setIssueCart((prev) => prev.filter((l) => l.storeItemId !== id))
                  setIssueQtyMap((m) => ({ ...m, [id]: '' }))
                  return
                }
                const storeQty = toStoreQty(item, qty, issueUnit)
                if (storeQty == null) {
                  toast.error(`Set pack size for ${item.name} first`)
                  return
                }
                if (storeQty > item.quantityInStore) {
                  toast.error(`Only ${item.quantityInStore} ${unitLabel(item.unit)} on hand`)
                  return
                }
                setIssueQtyMap((m) => ({ ...m, [id]: String(qty) }))
                setIssueCart((prev) =>
                  prev.map((l) =>
                    l.storeItemId === id
                      ? { ...l, quantity: qty, unit: issueUnit, maxAvailable: item.quantityInStore }
                      : l,
                  ),
                )
              }}
              onUnitChange={(id, unit) => {
                const item = storeItems.find((s) => s.id === id)
                const line = issueCart.find((l) => l.storeItemId === id)
                if (!item || !line) return
                setIssueUnitMap((m) => ({ ...m, [id]: unit }))
                const qty = line.quantity
                const storeQty = toStoreQty(item, qty, unit)
                if (storeQty == null) {
                  toast.error(`Set pack size for ${item.name} first`)
                  return
                }
                if (storeQty > item.quantityInStore) {
                  toast.error(`Only ${item.quantityInStore} ${unitLabel(item.unit)} on hand in ${unitLabel(unit)}`)
                  return
                }
                setIssueCart((prev) =>
                  prev.map((l) => (l.storeItemId === id ? { ...l, unit } : l)),
                )
              }}
              onCommit={handleCommitIssueCart}
            />
            </div>
          </TabsContent>
        )}

        {canIssue && (
          <TabsContent value="issue_out_log" className="mt-4 space-y-3">
            <div className="rounded-xl border overflow-hidden">
              <div className="border-b px-4 py-2 bg-muted/30 text-sm font-medium">
                Issue out history
              </div>
              {(issueOutLog ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  No items issued out yet. Transfers from the Issue Out tab appear here.
                </p>
              ) : (
                <>
                  <div className="md:hidden divide-y">
                    {(issueOutLog ?? []).map((row, index) => (
                      <div key={`${row.id}-${index}-m`} className="p-3 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm">{row.itemName}</p>
                          <span className="text-sm tabular-nums shrink-0">
                            {row.quantity} {unitLabel(row.unit)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{row.destination}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(row.issuedAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={RESPONSIVE_HIDE_LG}>When</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead className={RESPONSIVE_HIDE_MD}>Received by</TableHead>
                          <TableHead className={RESPONSIVE_HIDE_LG}>Issued by</TableHead>
                          <TableHead className={RESPONSIVE_HIDE_LG}>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(issueOutLog ?? []).map((row, index) => (
                          <TableRow key={`${row.id}-${index}`}>
                            <TableCell className={`text-xs whitespace-nowrap ${RESPONSIVE_HIDE_LG}`}>
                              {new Date(row.issuedAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="font-medium">{row.itemName}</TableCell>
                            <TableCell>
                              {row.quantity} {unitLabel(row.unit)}
                            </TableCell>
                            <TableCell>{row.destination}</TableCell>
                            <TableCell className={RESPONSIVE_HIDE_MD}>
                              {row.receivedBy || '—'}
                            </TableCell>
                            <TableCell className={RESPONSIVE_HIDE_LG}>{row.issuedBy}</TableCell>
                            <TableCell
                              className={`text-xs text-muted-foreground max-w-[160px] truncate ${RESPONSIVE_HIDE_LG}`}
                            >
                              {row.notes || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        )}

        <TabsContent value="purchase" className="mt-4">
          {purchaseLocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm text-muted-foreground mb-4">
              A purchase order is already in the approval pipeline. You can add items again after the
              accountant rejects it or once the current PO is retired.
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="rounded-xl border">
              <div className="border-b px-4 py-2 text-sm text-muted-foreground">
                Type a quantity to add to the active purchase list. Review and send from Purchase orders.
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
                    <>
                      <div className="md:hidden space-y-2">
                        {pageItems.map((item) => {
                          const rawQty = qtyMap[item.id] ?? ''
                          const purchaseUnit =
                            purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
                          const qty = parseQuantityValue(rawQty)
                          const storeQty =
                            qty > 0 ? toStoreQty(item, qty, purchaseUnit) : null
                          const factors = factorsFor(item)
                          const defaultPurchasePrice = purchaseUnitPriceFromStorePrice(
                            item.lastPrice,
                            purchaseUnit,
                            item.unit,
                            factors,
                          )
                          const price = Number(purchasePriceMap[item.id]) > 0
                            ? Number(purchasePriceMap[item.id])
                            : defaultPurchasePrice
                          const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                          const inBasket = basket.some((b) => b.stockItemId === item.id)
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                'rounded-lg border p-3 space-y-2',
                                inBasket && 'bg-amber-50/40',
                              )}
                            >
                              <p className="font-medium text-sm">
                                {item.name} ({unitLabel(item.unit)})
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {storeItemDepartments(item).map((d) => (
                                  <Badge key={d} variant="outline" className="text-[10px]">
                                    {DEPT_LABELS[d]}
                                  </Badge>
                                ))}
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">In store</span>
                                <span className={stockLevelNumberPillClass(level)}>
                                  {item.quantityInStore}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1">
                                  <Input
                                    inputMode="decimal"
                                    disabled={purchaseLocked}
                                    className="h-8 w-20 text-right"
                                    value={rawQty}
                                    onChange={(e) => handlePurchaseQtyChange(item, e.target.value)}
                                    onBlur={(e) => commitPurchaseQty(item, e.target.value)}
                                  />
                                  <UnitSelect
                                    storeUnit={item.unit}
                                    itemName={item.name}
                                    disabled={purchaseLocked}
                                    value={purchaseUnit}
                                    onChange={(u) => {
                                      setPurchaseUnitMap((m) => ({ ...m, [item.id]: u }))
                                      if (rawQty.trim()) commitPurchaseQty(item, rawQty, u)
                                    }}
                                  />
                                </div>
                                <Input
                                  inputMode="decimal"
                                  disabled={purchaseLocked}
                                  className="h-8 w-24 text-right"
                                  placeholder={`₦/${unitLabel(purchaseUnit)}`}
                                  value={purchasePriceMap[item.id] ?? ''}
                                  onChange={(e) =>
                                    setPurchasePriceMap((m) => ({
                                      ...m,
                                      [item.id]: sanitizeQuantityInput(e.target.value),
                                    }))
                                  }
                                  onBlur={() => {
                                    if (rawQty.trim()) commitPurchaseQty(item, rawQty)
                                  }}
                                />
                                <span className="text-sm font-medium tabular-nums">
                                  {storeQty != null && storeQty > 0
                                    ? formatNaira(qty * price)
                                    : '—'}
                                </span>
                              </div>
                              {storeQty != null && storeQty > 0 && purchaseUnit !== item.unit && (
                                <p className="text-[11px] text-muted-foreground">
                                  Receives {storeQty} {unitLabel(item.unit)} into store
                                  {price > 0
                                    ? ` · ${formatNaira(item.lastPrice)}/${unitLabel(item.unit)} in store`
                                    : ''}
                                </p>
                              )}
                              {needsUnitFactor(purchaseUnit, item.unit, factorsFor(item)) && (
                                <UnitConversionField
                                  compact
                                  storeItemId={item.id}
                                  storeUnit={item.unit}
                                  selectedUnit={purchaseUnit}
                                  factors={factorsFor(item)}
                                  onFactorsChange={(next) => {
                                    setFactorMap((m) => ({ ...m, [item.id]: next }))
                                    updateStoreItemDirect(item.id, { unitFactors: next }, actor)
                                    if (rawQty.trim()) commitPurchaseQty(item, rawQty)
                                  }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead className={RESPONSIVE_HIDE_MD}>Dept</TableHead>
                              <TableHead className="text-right">In Store</TableHead>
                              <TableHead className="text-right">Qty / unit</TableHead>
                              <TableHead className={`text-right ${RESPONSIVE_HIDE_MD}`}>
                                Unit Price
                              </TableHead>
                              <TableHead className="text-right">Line total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pageItems.map((item) => {
                              const rawQty = qtyMap[item.id] ?? ''
                              const purchaseUnit =
                                purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
                              const qty = parseQuantityValue(rawQty)
                              const storeQty =
                                qty > 0 ? toStoreQty(item, qty, purchaseUnit) : null
                              const defaultPurchasePrice = purchaseUnitPriceFromStorePrice(
                                item.lastPrice,
                                purchaseUnit,
                                item.unit,
                                factorsFor(item),
                              )
                              const price = Number(purchasePriceMap[item.id]) > 0
                                ? Number(purchasePriceMap[item.id])
                                : defaultPurchasePrice
                              const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                              const inBasket = basket.some((b) => b.stockItemId === item.id)
                              return (
                                <TableRow
                                  key={item.id}
                                  className={inBasket ? 'bg-amber-50/40' : undefined}
                                >
                                  <TableCell>
                                    {item.name} ({unitLabel(item.unit)})
                                  </TableCell>
                                  <TableCell className={RESPONSIVE_HIDE_MD}>
                                    <div className="flex flex-wrap gap-1">
                                      {storeItemDepartments(item).map((d) => (
                                        <Badge key={d} variant="outline" className="text-[10px]">
                                          {DEPT_LABELS[d]}
                                        </Badge>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={stockLevelNumberPillClass(level)}>
                                      {item.quantityInStore}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Input
                                        inputMode="decimal"
                                        disabled={purchaseLocked}
                                        className="h-8 w-20 text-right"
                                        value={rawQty}
                                        onChange={(e) =>
                                          handlePurchaseQtyChange(item, e.target.value)
                                        }
                                        onBlur={(e) => commitPurchaseQty(item, e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.currentTarget.blur()
                                            commitPurchaseQty(item, e.currentTarget.value)
                                          }
                                        }}
                                      />
                                      <UnitSelect
                                        storeUnit={item.unit}
                                        itemName={item.name}
                                        disabled={purchaseLocked}
                                        value={purchaseUnit}
                                        onChange={(u) => {
                                          setPurchaseUnitMap((m) => ({ ...m, [item.id]: u }))
                                          if (rawQty.trim()) commitPurchaseQty(item, rawQty, u)
                                        }}
                                      />
                                    </div>
                                    {storeQty != null && storeQty > 0 && purchaseUnit !== item.unit && (
                                      <p className="mt-1 text-[10px] text-muted-foreground">
                                        Receives {storeQty} {unitLabel(item.unit)}
                                      </p>
                                    )}
                                    {needsUnitFactor(purchaseUnit, item.unit, factorsFor(item)) && (
                                      <UnitConversionField
                                        compact
                                        storeItemId={item.id}
                                        storeUnit={item.unit}
                                        selectedUnit={purchaseUnit}
                                        factors={factorsFor(item)}
                                        onFactorsChange={(next) => {
                                          setFactorMap((m) => ({ ...m, [item.id]: next }))
                                          updateStoreItemDirect(item.id, { unitFactors: next }, actor)
                                          if (rawQty.trim()) commitPurchaseQty(item, rawQty)
                                        }}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell className={`text-right ${RESPONSIVE_HIDE_MD}`}>
                                    <Input
                                      inputMode="decimal"
                                      disabled={purchaseLocked}
                                      className="h-8 w-24 ml-auto text-right"
                                      placeholder={formatNaira(defaultPurchasePrice)}
                                      value={purchasePriceMap[item.id] ?? ''}
                                      onChange={(e) =>
                                        setPurchasePriceMap((m) => ({
                                          ...m,
                                          [item.id]: sanitizeQuantityInput(e.target.value),
                                        }))
                                      }
                                      onBlur={() => {
                                        if (rawQty.trim()) commitPurchaseQty(item, rawQty)
                                      }}
                                    />
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      per {unitLabel(purchaseUnit)}
                                      {storeQty != null && storeQty > 0
                                        ? ` · ${formatNaira(item.lastPrice)}/${unitLabel(item.unit)} in store`
                                        : ''}
                                    </p>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {storeQty != null && storeQty > 0
                                      ? formatNaira(qty * price)
                                      : '—'}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </PaginatedListShell>
              </div>
            </div>
            {basketSidebar}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm text-muted-foreground">
            Only <strong className="text-foreground">one purchase order</strong> at a time. The list
            stays here after you send to the accountant until the PO is retired. Approval is in{' '}
            <Link href="/expenses?tab=purchase_orders" className="underline font-medium text-foreground">
              Expenses → Purchase orders
            </Link>
            .
          </div>
          <ActivePurchaseOrderPanel actor={actor} storeItems={storeItems} />
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Accepted purchase orders (manager-approved and purchased). Click a PO to see every line
            item.
          </p>
          <PoHistoryPanel purchaseOrders={purchaseOrders} />
        </TabsContent>
      </Tabs>
      )}
    </div>
  )
}
