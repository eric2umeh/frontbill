'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import type { BatchMaterialLine, StoreItem } from '@/lib/supply-chain/types'
import { canonicalRoleKey } from '@/lib/permissions'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Minus, Plus, Search, Trash2, ChefHat } from 'lucide-react'
import { toast } from 'sonner'
import {
  clearKitchenBatchDraft,
  loadKitchenBatchDraft,
  persistKitchenBatchDraft,
} from '@/lib/supply-chain/kitchen-batch-draft'
import { OutletCategorySearchField } from '@/components/supply-chain/outlet-category-search-field'
import { OutletMenuItemSearchField } from '@/components/supply-chain/outlet-menu-item-search-field'
import { outletStockSlug } from '@/lib/outlets/outlet-stock-slug'

const BATCH_CREATOR_ROLES = new Set(['superadmin', 'admin', 'manager'])

export function KitchenBatchBuilder() {
  const { name, role } = useAuth()
  const { storeItems, kitchenRawStock, kitchenRawOnHand, openKitchenBatchFromMaterials } =
    useSupplyChain()
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [batchName, setBatchName] = useState('')
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [linkedKitchenStockId, setLinkedKitchenStockId] = useState<string | null>(null)
  const [menuCategory, setMenuCategory] = useState('')
  const [menuCategoryId, setMenuCategoryId] = useState<string | null>(null)
  const [plannedPortions, setPlannedPortions] = useState('4')
  const [sellingPrice, setSellingPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [cart, setCart] = useState<BatchMaterialLine[]>([])

  useEffect(() => {
    const draft = loadKitchenBatchDraft()
    setSearch(draft.search)
    setMenuCategory(draft.menuCategory)
    setMenuCategoryId(draft.menuCategoryId)
    setBatchName(draft.batchName)
    setMenuItemId(draft.menuItemId)
    setLinkedKitchenStockId(draft.linkedKitchenStockId)
    setPlannedPortions(draft.plannedPortions)
    setSellingPrice(draft.sellingPrice)
    setNotes(draft.notes)
    setCart(draft.cart)
    setDraftLoaded(true)
  }, [])

  useEffect(() => {
    if (!draftLoaded) return
    persistKitchenBatchDraft({
      search,
      menuCategory,
      menuCategoryId,
      batchName,
      menuItemId,
      linkedKitchenStockId,
      plannedPortions,
      sellingPrice,
      notes,
      cart,
    })
  }, [
    draftLoaded,
    search,
    menuCategory,
    menuCategoryId,
    batchName,
    menuItemId,
    linkedKitchenStockId,
    plannedPortions,
    sellingPrice,
    notes,
    cart,
  ])

  const actor = { name: name ?? 'Kitchen', role: canonicalRoleKey(role) ?? 'staff' }
  const canCreateBatch = BATCH_CREATOR_ROLES.has(canonicalRoleKey(role) ?? '')

  const kitchenStoreItems = useMemo(
    () => storeItems.filter((s) => s.dept === 'kitchen'),
    [storeItems],
  )

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return kitchenStoreItems.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 30)
  }, [kitchenStoreItems, search])

  const batchCost = cart.reduce((sum, l) => sum + l.quantity * l.unitCost, 0)
  const planned = Number(plannedPortions) || 0
  const sell = Number(sellingPrice) || 0
  const revenue = planned * sell
  const marginPct =
    revenue > 0 ? Math.round(((revenue - batchCost) / revenue) * 1000) / 10 : 0

  const addMaterial = (item: StoreItem) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.storeItemId === item.id)
      if (ex) {
        return prev.map((c) =>
          c.storeItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        )
      }
      return [
        ...prev,
        {
          storeItemId: item.id,
          name: item.name,
          unit: item.unit,
          quantity: 1,
          unitCost: item.lastPrice,
        },
      ]
    })
    if (!batchName.trim() && !menuItemId) setBatchName(item.name)
    setSearch('')
    setSearchOpen(false)
  }

  const setLineQty = (storeItemId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.storeItemId !== storeItemId))
      return
    }
    setCart((prev) =>
      prev.map((c) => (c.storeItemId === storeItemId ? { ...c, quantity: qty } : c)),
    )
  }

  const rawOnHand = (storeItemId: string) => kitchenRawOnHand(storeItemId)

  const handleCreate = async () => {
    if (!canCreateBatch) {
      toast.error('Only Admin, Manager, or Superadmin can create a new production batch')
      return
    }
    if (!menuCategory.trim()) {
      toast.error('Menu category is required — it syncs to the Restaurant outlet')
      return
    }
    const stockId =
      linkedKitchenStockId?.trim() || `ks-${outletStockSlug(batchName.trim())}`

    const res = openKitchenBatchFromMaterials(
      {
        batchName: batchName.trim(),
        menuCategory: menuCategory.trim(),
        plannedPortions: planned,
        sellingPricePerPortion: sell,
        materials: cart,
        notes: notes.trim() || undefined,
        kitchenStockId: stockId,
      },
      actor,
    )
    if ('error' in res) {
      toast.error(res.error)
      return
    }

    try {
      const sync = await fetch('/api/supply/sync-restaurant-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          batchName: batchName.trim(),
          categoryName: menuCategory.trim(),
          unitPrice: sell,
          kitchenStockId: res.kitchenStockId,
          menuItemId: menuItemId ?? undefined,
        }),
      })
      const syncJson = await sync.json().catch(() => ({}))
      if (!sync.ok) {
        toast.warning(
          `Batch created locally but Restaurant menu sync failed: ${syncJson.error ?? 'unknown error'}`,
        )
      } else {
        toast.success(
          `Batch "${batchName}" created and synced to Restaurant menu (${res.kitchenStockId})`,
        )
      }
    } catch {
      toast.warning('Batch created but could not reach server to sync Restaurant menu')
    }

    setCart([])
    setBatchName('')
    setMenuItemId(null)
    setLinkedKitchenStockId(null)
    setMenuCategory('')
    setMenuCategoryId(null)
    setPlannedPortions('4')
    setSellingPrice('')
    setNotes('')
    setSearch('')
    clearKitchenBatchDraft()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr] min-h-[min(72vh,720px)]">
      <div className="rounded-xl border flex flex-col overflow-hidden bg-card">
        <div className="p-4 border-b space-y-2">
          <h3 className="font-semibold text-sm">Search store items</h3>
          <p className="text-xs text-muted-foreground">
            Materials must be issued from Central Store → Kitchen first. Type to search kitchen
            stock.
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Rice, chicken, oil, maggi…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              autoComplete="off"
            />
            {searchOpen && search.trim() && (
              <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md">
                {searchResults.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">No items match</li>
                ) : (
                  searchResults.map((item) => {
                    const inCart = cart.find((c) => c.storeItemId === item.id)
                    const reserved = inCart?.quantity ?? 0
                    const issued = kitchenRawOnHand(item.id)
                    const available = Math.max(0, issued - reserved)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addMaterial(item)}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {available} {item.unit} issued to kitchen
                            {inCart ? ` · ${inCart.quantity} in batch` : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </div>
        </div>
        <div className="flex-1 p-4 text-xs text-muted-foreground">
          {kitchenRawStock.length} material(s) issued to kitchen. Results appear as you type.
        </div>
      </div>

      <div className="rounded-xl border flex flex-col overflow-hidden bg-card min-h-[min(72vh,720px)]">
        <div className="border-b px-4 py-3 bg-muted/30 shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ChefHat className="h-4 w-4" />
            New batch
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Selected materials and batch details. Saved automatically.
          </p>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
                <ChefHat className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No materials yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Search on the left and pick items — they will appear here.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {cart.map((line) => {
                  const onHand = rawOnHand(line.storeItemId)
                  return (
                    <li
                      key={line.storeItemId}
                      className="rounded-lg border p-3 text-sm space-y-2 bg-background"
                    >
                      <div className="flex justify-between gap-2">
                        <div>
                          <p className="font-medium">{line.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Kitchen stock: {onHand} {line.unit}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive shrink-0"
                          onClick={() => setLineQty(line.storeItemId, 0)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          allowRepeatClick
                          onClick={() => setLineQty(line.storeItemId, line.quantity - 1)}
                        >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-20 text-center"
                            value={line.quantity}
                            onChange={(e) =>
                              setLineQty(line.storeItemId, Number(e.target.value) || 0)
                            }
                          />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          allowRepeatClick
                          onClick={() => setLineQty(line.storeItemId, line.quantity + 1)}
                        >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground ml-1">{line.unit}</span>
                        </div>
                        <span className="text-sm font-medium tabular-nums">
                          {formatNaira(line.quantity * line.unitCost)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4 space-y-3 bg-muted/20 shrink-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <OutletMenuItemSearchField
                value={batchName}
                menuItemId={menuItemId}
                required
                onChange={(sel) => {
                  setBatchName(sel.name)
                  if (sel.menuItemId !== undefined) setMenuItemId(sel.menuItemId)
                  if (sel.kitchenStockId !== undefined) setLinkedKitchenStockId(sel.kitchenStockId)
                  if (sel.categoryName !== undefined) {
                    setMenuCategory(sel.categoryName)
                    setMenuCategoryId(sel.categoryId ?? null)
                  }
                  if (sel.sellingPrice !== undefined && sel.sellingPrice != null && sel.sellingPrice > 0) {
                    setSellingPrice(String(sel.sellingPrice))
                  }
                }}
              />
            </div>
            <div>
              <OutletCategorySearchField
                value={menuCategory}
                categoryId={menuCategoryId}
                onChange={(n, id) => {
                  setMenuCategory(n)
                  setMenuCategoryId(id)
                }}
                required
              />
            </div>
            <div>
              <Label className="text-xs">Planned portions</Label>
              <Input
                type="number"
                min={1}
                className="h-9 mt-0.5"
                value={plannedPortions}
                onChange={(e) => setPlannedPortions(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Selling price / portion (₦)</Label>
              <Input
                type="number"
                min={0}
                className="h-9 mt-0.5"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium pt-1">
            <span>Batch cost</span>
            <span className="text-base">{formatNaira(batchCost)}</span>
          </div>
          {revenue > 0 && (
            <p className="text-xs text-emerald-700">
              Est. revenue {formatNaira(revenue)} · margin {marginPct}%
            </p>
          )}
          {!canCreateBatch && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              Chefs can build the list; only Admin / Manager / Superadmin can create the batch.
            </p>
          )}
          <Button
            className="w-full"
            disabled={
              !canCreateBatch ||
              !cart.length ||
              !batchName.trim() ||
              !menuCategory.trim()
            }
            onClick={handleCreate}
          >
            Create batch &amp; sync to Restaurant
          </Button>
        </div>
      </div>
    </div>
  )
}
