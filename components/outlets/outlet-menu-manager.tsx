'use client'

import { useMemo, useState, useEffect } from 'react'
import type { OutletMenuCategoryRow, OutletMenuItemRow } from '@/lib/outlets/types'
import { isStoreControlledFnbOutlet, type OutletDepartmentKey } from '@/lib/outlets/departments'
import { itemAllowsPosPriceEdit } from '@/lib/outlets/category-price-editable'
import { isKitchenSyncedMenuItem, kitchenStockIdFromServiceCode } from '@/lib/supply-chain/kitchen-menu-link'
import { filterOutletMenuForActiveKitchenBatches, recipeIdForKitchenStockId } from '@/lib/supply-chain/kitchen-batch-link'
import { syncBatchToRestaurantOutlet } from '@/lib/supply-chain/sync-restaurant-outlet'
import { shouldSyncBatchToOutlet } from '@/lib/supply-chain/batch-outlet-sync'
import { useAuth } from '@/lib/auth-context'
import { canCountOutletDepartmentStock, canKickstartOutletStock, canonicalRoleKey } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Trash2, Package, Search } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { ORG_LIVE_OUTLET_MENU, dispatchOrgLiveEvent } from '@/lib/live/org-live-events'
import { OutletItemMetaFields } from '@/components/outlets/outlet-item-meta-fields'
import { isLegacyDefaultDescription } from '@/lib/outlets/item-display'
import { sortOutletMenuByName } from '@/lib/outlets/sort-outlet-menu'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { outletStockSource } from '@/lib/outlets/outlet-supply-stock'
import {
  getStockLevel,
  stockLevelBadgeClass,
  stockLevelRowClass,
  stockLevelStatusLabel,
  stockLevelTextClass,
} from '@/lib/supply-chain/stock-level-ui'
import {
  formatOutletStockQtyDisplay,
} from '@/lib/outlets/outlet-supply-stock'
import { seedDefaultDrinkCategories } from '@/lib/outlets/seed-drink-categories'
import { titleCaseWhileTyping, toTitleCaseWords } from '@/lib/supply-chain/title-case'
import {
  isCompleteQuantityInput,
  parseQuantityValue,
  sanitizeQuantityInput,
} from '@/lib/supply-chain/measurement-units'
import { usePaginatedList } from '@/lib/hooks/use-paginated-list'
import { TableListControls } from '@/components/shared/table-list-controls'

type Props = {
  department: OutletDepartmentKey
  categories: OutletMenuCategoryRow[]
  items: OutletMenuItemRow[]
  canManage: boolean
  /** Auditor: price & category on Main Bar / Restaurant kitchen dishes. */
  canEditMenuPricing?: boolean
  onRefresh: () => void
  /** Apply a server-saved menu row without waiting for a full reload. */
  onMenuItemUpdated?: (item: OutletMenuItemRow) => void
}

const emptyItemForm = {
  name: '',
  category_id: '',
  unit_price: '',
  description: '',
  tags: [] as string[],
  price_editable: false,
}

function parseItemUnitPrice(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

const numberInputValue = (value: number | null | undefined) =>
  value != null ? String(value) : ''

export function OutletMenuManager({ department, categories, items, canManage, canEditMenuPricing = false, onRefresh, onMenuItemUpdated }: Props) {
  const { name: staffName, role } = useAuth()
  const supply = useSupplyChain()
  const { recipes } = supply
  const stockPipeline = outletStockSource(department)
  const storeControlledFnb = isStoreControlledFnbOutlet(department)
  const showOutletQty = stockPipeline !== 'none'
  const canAdjustStock = canKickstartOutletStock(role) && storeControlledFnb
  const canCountStock = canCountOutletDepartmentStock(role) && storeControlledFnb
  const actor = { name: staffName ?? 'Staff', role: canonicalRoleKey(role) ?? 'staff' }
  const canEditCategoryOrPrice = canManage || canEditMenuPricing
  const sortedCategories = useMemo(() => sortOutletMenuByName(categories), [categories])
  const sortedItems = useMemo(() => sortOutletMenuByName(items), [items])
  const [itemSearch, setItemSearch] = useState('')
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string>('all')
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    const batchLinked = filterOutletMenuForActiveKitchenBatches(
      sortedItems,
      department,
      recipes,
      supply.kitchenStock,
    )
    return batchLinked.filter((it) => {
      if (department === 'main_bar' && !it.is_active) return false
      if (itemCategoryFilter === '__uncategorized__') {
        if (it.category_id) return false
      } else if (itemCategoryFilter !== 'all') {
        if (it.category_id !== itemCategoryFilter) return false
      }
      if (!q) return true
      const cat = sortedCategories.find((c) => c.id === it.category_id)
      const haystack = [it.name, cat?.name, it.description, ...(it.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [sortedItems, sortedCategories, itemSearch, itemCategoryFilter, department, recipes, supply.kitchenStock])
  const {
    paginatedItems,
    page,
    setPage,
    totalPages,
    totalCount,
    startIndex,
  } = usePaginatedList({
    items: filteredItems,
    pageSize: 15,
    search: '',
  })

  useEffect(() => {
    setPage(1)
  }, [itemSearch, itemCategoryFilter, department, setPage])

  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatPriceEditable, setNewCatPriceEditable] = useState(false)
  const [form, setForm] = useState(emptyItemForm)

  const [editCategory, setEditCategory] = useState<OutletMenuCategoryRow | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatPriceEditable, setEditCatPriceEditable] = useState(false)
  const [deleteCategory, setDeleteCategory] = useState<OutletMenuCategoryRow | null>(null)

  const [editItem, setEditItem] = useState<OutletMenuItemRow | null>(null)
  const [editItemForm, setEditItemForm] = useState(emptyItemForm)
  const [editItemActive, setEditItemActive] = useState(true)
  const [deleteItem, setDeleteItem] = useState<OutletMenuItemRow | null>(null)

  const [stockEditItem, setStockEditItem] = useState<OutletMenuItemRow | null>(null)
  const [stockEditQty, setStockEditQty] = useState('')
  const [stockEditUnit, setStockEditUnit] = useState('portion')
  const [stockCountDraft, setStockCountDraft] = useState<Record<string, string>>({})
  const [categorySavingId, setCategorySavingId] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({})
  const [priceSavingId, setPriceSavingId] = useState<string | null>(null)

  const syncKitchenBatchFromOutletItem = async (
    item: OutletMenuItemRow,
    patch: { unitPrice?: number; categoryName?: string },
  ) => {
    if (department !== 'restaurant' || !isKitchenSyncedMenuItem(item.service_code)) return
    const ksId = kitchenStockIdFromServiceCode(item.service_code)
    if (!ksId) return
    const recipeId = recipeIdForKitchenStockId(supply.recipes, ksId, supply.kitchenStock)
    if (!recipeId) return
    const outletPatch: { sellingPricePerPortion?: number; category?: string } = {}
    if (patch.unitPrice != null) outletPatch.sellingPricePerPortion = patch.unitPrice
    if (patch.categoryName) outletPatch.category = patch.categoryName
    if (!Object.keys(outletPatch).length) return
    const res = supply.updateRecipeOutletFields(recipeId, outletPatch, actor)
    if ('error' in res) {
      toast.warning(`Menu saved but Kitchen batch not updated: ${res.error}`)
    }
  }

  const updateItemCategory = async (item: OutletMenuItemRow, categoryId: string | null) => {
    if (!canEditCategoryOrPrice) return
    const nextCategoryId = categoryId || null
    if ((item.category_id || null) === nextCategoryId) return
    setCategorySavingId(item.id)
    try {
      const res = await fetch('/api/outlets/menu/items', {
        method: 'PATCH',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ id: item.id, category_id: nextCategoryId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to update category')
        return
      }
      const categoryName = nextCategoryId
        ? sortedCategories.find((c) => c.id === nextCategoryId)?.name
        : undefined
      await syncKitchenBatchFromOutletItem(item, { categoryName })
      toast.success(`Category updated for ${item.name}`)
      onRefresh()
    } finally {
      setCategorySavingId(null)
    }
  }

  const updateItemPrice = async (item: OutletMenuItemRow) => {
    if (!canEditCategoryOrPrice) return
    const raw = priceDraft[item.id] ?? String(item.unit_price)
    const unitPrice = parseItemUnitPrice(raw)
    if (unitPrice == null) {
      toast.error('Enter a valid price')
      setPriceDraft((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      return
    }
    if (Number(item.unit_price) === unitPrice) {
      setPriceDraft((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      return
    }
    setPriceSavingId(item.id)
    try {
      const res = await fetch('/api/outlets/menu/items', {
        method: 'PATCH',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ id: item.id, unit_price: unitPrice }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to update price — change was not saved')
        setPriceDraft((prev) => {
          const next = { ...prev }
          delete next[item.id]
          return next
        })
        return
      }
      const saved = json.item as OutletMenuItemRow | undefined
      if (saved?.id) {
        onMenuItemUpdated?.(saved)
      }
      await syncKitchenBatchFromOutletItem(item, { unitPrice })
      toast.success(`Price saved for ${item.name}`)
      setPriceDraft((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('frontbill:outlet-menu-price-saved'))
        dispatchOrgLiveEvent(ORG_LIVE_OUTLET_MENU)
      }
      onRefresh()
    } finally {
      setPriceSavingId(null)
    }
  }

  const drinkMenu = department === 'main_bar' || department === 'pool_bar'
  const itemTableColSpan =
    5 + (showOutletQty ? 1 : 0) + (canManage || canAdjustStock ? 1 : 0)

  const commitOutletStockCount = async (it: OutletMenuItemRow) => {
    const raw = stockCountDraft[it.id]
    if (raw == null) return
    if (!isCompleteQuantityInput(raw)) {
      toast.error('Enter a valid quantity')
      setStockCountDraft((prev) => {
        const next = { ...prev }
        delete next[it.id]
        return next
      })
      return
    }
    const qty = parseQuantityValue(raw)
    if (qty == null || qty < 0) {
      toast.error('Enter a valid quantity')
      setStockCountDraft((prev) => {
        const next = { ...prev }
        delete next[it.id]
        return next
      })
      return
    }
    const link = supply.getOutletItemStock(department, it)
    if (!link.tracked) return

    if (link.stockId) {
      const result =
        link.source === 'bar'
          ? supply.setBarStockOnHand(link.stockId, qty, actor)
          : supply.setKitchenStockAvailable(link.stockId, qty, actor)
      if ('error' in result) {
        toast.error(result.error || 'Quantity was not saved')
        setStockCountDraft((prev) => {
          const next = { ...prev }
          delete next[it.id]
          return next
        })
        return
      }
      setStockCountDraft((prev) => {
        const next = { ...prev }
        delete next[it.id]
        return next
      })
      toast.success(`${it.name}: ${qty} ${link.unit}(s) saved`)
      return
    }

    setSaving(true)
    try {
      const res = supply.kickstartOutletMenuStock(department, it, qty, actor)
      if ('error' in res) {
        toast.error(res.error || 'Quantity was not saved')
        setStockCountDraft((prev) => {
          const next = { ...prev }
          delete next[it.id]
          return next
        })
        return
      }
      const patchRes = await fetch('/api/outlets/menu/items', {
        method: 'PATCH',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ id: it.id, service_code: res.serviceCode }),
      })
      if (!patchRes.ok) {
        const json = await patchRes.json().catch(() => ({}))
        toast.error(json.error || 'Stock saved but menu link failed — refresh and retry')
        setStockCountDraft((prev) => {
          const next = { ...prev }
          delete next[it.id]
          return next
        })
        return
      }
      setStockCountDraft((prev) => {
        const next = { ...prev }
        delete next[it.id]
        return next
      })
      toast.success(`${it.name}: ${qty} ${res.unit}(s) saved`)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const openEditCategory = (c: OutletMenuCategoryRow) => {
    setEditCategory(c)
    setEditCatName(toTitleCaseWords(c.name))
    setEditCatPriceEditable(!!c.price_editable)
  }

  const openStockEdit = (it: OutletMenuItemRow) => {
    const link = supply.getOutletItemStock(department, it)
    setStockEditItem(it)
    setStockEditQty(numberInputValue(link.tracked ? link.available : 0))
    setStockEditUnit(link.unit || (stockPipeline === 'bar' ? 'bottle' : 'portion'))
  }

  const saveStockQty = async () => {
    if (!stockEditItem) return
    const qty = Number(stockEditQty)
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Enter a valid quantity')
      return
    }
    setSaving(true)
    try {
      const res = supply.kickstartOutletMenuStock(department, stockEditItem, qty, actor)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      const patchRes = await fetch('/api/outlets/menu/items', {
        method: 'PATCH',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ id: stockEditItem.id, service_code: res.serviceCode }),
      })
      if (!patchRes.ok) {
        const json = await patchRes.json().catch(() => ({}))
        toast.error(json.error || 'Stock updated but failed to save menu link')
        return
      }
      toast.success(`${stockEditItem.name} → ${qty} ${stockEditUnit}(s) available`)
      setStockEditItem(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const openEditItem = (it: OutletMenuItemRow) => {
    setEditItem(it)
    const price = Number(it.unit_price)
    setEditItemForm({
      name: it.name,
      category_id: it.category_id || '',
      unit_price: numberInputValue(Number.isFinite(price) ? price : 0),
      description: isLegacyDefaultDescription(it.description) ? '' : it.description || '',
      tags: [...(it.tags || [])],
      price_editable: !!it.price_editable,
    })
    setEditItemActive(it.is_active)
  }

  const addCategory = async () => {
    if (!newCatName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/outlets/menu/categories', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          department,
          name: toTitleCaseWords(newCatName),
          price_editable: newCatPriceEditable,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed')
        return
      }
      toast.success('Category added')
      setNewCatName('')
      setNewCatPriceEditable(false)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const saveCategory = async () => {
    if (!editCategory || !editCatName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/outlets/menu/categories', {
        method: 'PATCH',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          id: editCategory.id,
          name: toTitleCaseWords(editCatName),
          price_editable: editCatPriceEditable,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Update failed')
        return
      }
      toast.success('Category updated')
      setEditCategory(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteCategory = async () => {
    if (!deleteCategory) return
    setSaving(true)
    try {
      const res = await fetch(`/api/outlets/menu/categories?id=${encodeURIComponent(deleteCategory.id)}`, {
        method: 'DELETE',
        headers: await outletApiHeaders(),
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Delete failed')
        return
      }
      toast.success('Category deleted')
      setDeleteCategory(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const addItem = async () => {
    if (!form.name.trim()) {
      toast.error('Name required')
      return
    }
    const unitPrice = parseItemUnitPrice(form.unit_price)
    if (unitPrice == null) {
      toast.error('Enter a valid price')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/outlets/menu/items', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          department,
          name: form.name.trim(),
          category_id: form.category_id || null,
          unit_price: unitPrice,
          price_editable: form.price_editable,
          description: form.description.trim(),
          tags: form.tags,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed')
        return
      }
      toast.success('Item added')
      setForm(emptyItemForm)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const saveItem = async () => {
    if (!editItem || !editItemForm.name.trim()) {
      toast.error('Name required')
      return
    }
    const unitPrice = parseItemUnitPrice(editItemForm.unit_price)
    if (unitPrice == null) {
      toast.error('Enter a valid price')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/outlets/menu/items', {
        method: 'PATCH',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          id: editItem.id,
          name: editItemForm.name.trim(),
          category_id: editItemForm.category_id || null,
          unit_price: unitPrice,
          price_editable: editItemForm.price_editable,
          description: editItemForm.description.trim(),
          tags: editItemForm.tags,
          is_active: editItemActive,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Update failed')
        return
      }
      const saved = json.item as OutletMenuItemRow | undefined
      if (saved?.id) {
        onMenuItemUpdated?.(saved)
      }
      const categoryName = editItemForm.category_id
        ? sortedCategories.find((c) => c.id === editItemForm.category_id)?.name
        : undefined
      if (editItem) {
        await syncKitchenBatchFromOutletItem(editItem, {
          unitPrice,
          categoryName,
        })
      }
      if (department === 'main_bar' && Number(editItem.unit_price) !== unitPrice) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('frontbill:outlet-menu-price-saved'))
          dispatchOrgLiveEvent(ORG_LIVE_OUTLET_MENU)
        }
      }
      toast.success('Item updated')
      setEditItem(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteItem = async () => {
    if (!deleteItem) return
    const storeLinkedBar =
      department === 'main_bar' &&
      String(deleteItem.service_code ?? '').trim().toLowerCase().startsWith('bar:')
    setSaving(true)
    try {
      if (storeLinkedBar) {
        const res = await fetch('/api/outlets/menu/items', {
          method: 'PATCH',
          headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({ id: deleteItem.id, is_active: false }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(json.error || 'Remove failed')
          return
        }
        toast.success(`${deleteItem.name} removed from Main Bar menu (still in Central Store)`)
      } else {
        const res = await fetch(`/api/outlets/menu/items?id=${encodeURIComponent(deleteItem.id)}`, {
          method: 'DELETE',
          headers: await outletApiHeaders(),
          credentials: 'include',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(json.error || 'Delete failed')
          return
        }
        toast.success('Item deleted')
      }
      setDeleteItem(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (item: OutletMenuItemRow, active: boolean) => {
    if (!canManage) return
    const res = await fetch('/api/outlets/menu/items', {
      method: 'PATCH',
      headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ id: item.id, is_active: active }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Update failed')
      return
    }
    onRefresh()
  }

  return (
    <div className="space-y-4">
      {department === 'gym' && (
        <p className="text-sm text-muted-foreground rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2">
          Add membership types (monthly, annual), day passes, and personal training as menu items.
          Admins can create categories such as Membership, Day Pass, and set prices per plan.
        </p>
      )}
      {!canManage && !canEditMenuPricing && (
        <p className="text-sm text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2">
          {department === 'main_bar'
            ? 'View only. Only Superadmin or Administrator can add, edit, or delete categories and items.'
            : 'View only. F&amp;B, Superadmin, Administrator, or Manager can add, edit, or delete categories and items.'}
        </p>
      )}
      {!canManage && canEditMenuPricing && (
        <p className="text-sm text-muted-foreground rounded-lg border border-violet-200 bg-violet-50/70 dark:bg-violet-950/20 px-3 py-2">
          Auditor: you can change <strong>category</strong> and <strong>price</strong> on this menu.
          {department === 'restaurant'
            ? ' Restaurant price updates also update Kitchen → All Batches for kitchen-linked dishes.'
            : null}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Items ({filteredItems.length}
            {filteredItems.length !== sortedItems.length ? ` of ${sortedItems.length}` : ''})
          </CardTitle>
          {showOutletQty && (
            <CardDescription>
              {storeControlledFnb
                ? department === 'main_bar' || department === 'pool_bar'
                  ? department === 'main_bar'
                    ? 'Items mirror Central Store (Main Bar department): name and price from store, qty starts at 0. Issue-out adds stock. Remove items you do not sell here.'
                    : 'Tap Qty available to set a physical count. Store issue-out (Issue Out → Main Bar) adds bottles on top of that number.'
                  : 'Tap Qty available to set a physical count. Kitchen production close adds portions on top of that number.'
                : stockPipeline === 'kitchen'
                  ? 'Qty = kitchen portions (store → batch → prepared food).'
                  : 'Qty = bar stock issued from Central Store (same path as kitchen → restaurant).'}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search items by name, category, or tag…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={itemCategoryFilter === 'all' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setItemCategoryFilter('all')}
            >
              All categories
            </Button>
            <Button
              type="button"
              size="sm"
              variant={itemCategoryFilter === '__uncategorized__' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setItemCategoryFilter('__uncategorized__')}
            >
              Uncategorized
            </Button>
            {sortedCategories.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant={itemCategoryFilter === c.id ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setItemCategoryFilter(c.id)}
              >
                {c.parent_id ? `↳ ${toTitleCaseWords(c.name)}` : toTitleCaseWords(c.name)}
              </Button>
            ))}
          </div>
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-2 w-12">#</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2 min-w-[160px]">Category</th>
                  {showOutletQty && <th className="text-right p-2">Qty available</th>}
                  <th className="text-right p-2">Price</th>
                  <th className="p-2">Active</th>
                  {(canManage || canAdjustStock) && <th className="p-2 w-28">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={itemTableColSpan} className="p-4 text-center text-muted-foreground">
                      No items match your search or category filter.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((it, rowIdx) => {
                  const cat = sortedCategories.find((c) => c.id === it.category_id)
                  const stockLink = showOutletQty
                    ? supply.getOutletItemStock(department, it)
                    : null
                  let qtyLevel: ReturnType<typeof getStockLevel> | null = null
                  if (stockLink?.tracked && stockLink.stockId) {
                    if (stockLink.source === 'kitchen') {
                      const row = supply.kitchenStock.find((k) => k.id === stockLink.stockId)
                      qtyLevel = getStockLevel(
                        stockLink.available,
                        row?.reorderLevel ?? 2,
                      )
                    } else {
                      const row = supply.barStock.find((b) => b.id === stockLink.stockId)
                      qtyLevel = getStockLevel(
                        stockLink.available,
                        row?.reorderLevel ?? 6,
                      )
                    }
                  } else if (storeControlledFnb) {
                    qtyLevel = 'out'
                  }
                  const qtyLabel = stockLink
                    ? formatOutletStockQtyDisplay(stockLink)
                    : null
                  return (
                    <tr
                      key={it.id}
                      className={cn('border-t', qtyLevel && stockLevelRowClass(qtyLevel))}
                    >
                      <td className="p-2 text-right tabular-nums text-muted-foreground text-xs">
                        {startIndex + rowIdx + 1}
                      </td>
                      <td className="p-2 font-medium">
                        {it.name}
                        {isKitchenSyncedMenuItem(it.service_code) && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] h-4 px-1 border-orange-300 text-orange-800">
                            Kitchen batch
                          </Badge>
                        )}
                        {itemAllowsPosPriceEdit(it, sortedCategories) && (
                          <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">
                            {it.price_editable || Number(it.unit_price) === 0 ? 'Price at sale' : 'Flex price'}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2">
                        {canEditCategoryOrPrice ? (
                          <Select
                            value={it.category_id || '__none__'}
                            disabled={categorySavingId === it.id || saving}
                            onValueChange={(v) =>
                              void updateItemCategory(it, v === '__none__' ? null : v)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs max-w-[180px]">
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Uncategorized</SelectItem>
                              {sortedCategories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.parent_id ? `↳ ${toTitleCaseWords(c.name)}` : toTitleCaseWords(c.name)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{cat?.name ?? '—'}</span>
                        )}
                      </td>
                      {showOutletQty && (
                        <td className="p-2 text-right">
                          {stockLink ? (
                            <span className="inline-flex flex-col items-end gap-0.5">
                              {canCountStock && stockLink.tracked ? (
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <Input
                                    className="h-8 w-20 text-right tabular-nums"
                                    inputMode="decimal"
                                    disabled={saving}
                                    value={
                                      stockCountDraft[it.id] ??
                                      String(stockLink.available)
                                    }
                                    onChange={(e) =>
                                      setStockCountDraft((prev) => ({
                                        ...prev,
                                        [it.id]: sanitizeQuantityInput(e.target.value),
                                      }))
                                    }
                                    onBlur={() => void commitOutletStockCount(it)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur()
                                      }
                                    }}
                                  />
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {stockLink.unit}
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className={
                                    qtyLevel
                                      ? stockLevelTextClass(qtyLevel)
                                      : 'text-muted-foreground text-xs'
                                  }
                                >
                                  {qtyLabel}
                                </span>
                              )}
                              {qtyLevel && (
                                <Badge className={`text-[10px] h-5 ${stockLevelBadgeClass(qtyLevel)}`}>
                                  {qtyLevel === 'out' ? 'Unavailable' : stockLevelStatusLabel(qtyLevel)}
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      )}
                      <td className="p-2 text-right font-mono">
                        {canEditCategoryOrPrice &&
                        !(itemAllowsPosPriceEdit(it, sortedCategories) && Number(it.unit_price) === 0) ? (
                          <Input
                            className="h-8 w-24 ml-auto text-right tabular-nums font-mono"
                            inputMode="decimal"
                            disabled={priceSavingId === it.id || saving}
                            value={priceDraft[it.id] ?? String(it.unit_price)}
                            onChange={(e) =>
                              setPriceDraft((prev) => ({
                                ...prev,
                                [it.id]: sanitizeQuantityInput(e.target.value),
                              }))
                            }
                            onBlur={() => void updateItemPrice(it)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                            }}
                          />
                        ) : itemAllowsPosPriceEdit(it, sortedCategories) && Number(it.unit_price) === 0 ? (
                          '—'
                        ) : (
                          formatNaira(it.unit_price)
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <Switch
                          checked={it.is_active}
                          disabled={!canManage}
                          onCheckedChange={(v) => void toggleActive(it, v)}
                        />
                      </td>
                      {(canManage || canAdjustStock) && (
                        <td className="p-2">
                          <div className="flex justify-center gap-0.5">
                            {canAdjustStock && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openStockEdit(it)}
                                title="Adjust stock quantity"
                              >
                                <Package className="h-4 w-4" />
                              </Button>
                            )}
                            {canManage && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditItem(it)}
                                  title="Edit item"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => setDeleteItem(it)}
                                  title="Delete item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                  })
                )}
              </tbody>
            </table>
          </div>
          {totalCount > 0 && (
            <TableListControls
              section="pagination"
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              startIndex={startIndex}
              pageSize={15}
              totalCount={totalCount}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              {drinkMenu
                ? 'Group drinks (Wine, Soft Drink, Cocktail, Spirits, …). F&B, Admin, Manager, or Superadmin can create, edit, and delete categories. Each word is capitalised.'
                : 'Group items (e.g. Buffet, Banquets). Enable flexible POS price for categories where the cashier may change the amount per order only.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="New category name"
                    value={newCatName}
                    onChange={(e) => setNewCatName(titleCaseWhileTyping(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && void addCategory()}
                  />
                  <Button type="button" onClick={() => void addCategory()} disabled={saving}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {drinkMenu && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true)
                      try {
                        const res = await seedDefaultDrinkCategories(
                          department === 'pool_bar' ? 'pool_bar' : 'main_bar',
                        )
                        if ('error' in res) {
                          toast.error(res.error)
                          return
                        }
                        toast.success(
                          res.created
                            ? `Added ${res.created} drink categories`
                            : 'Default drink categories already exist',
                        )
                        onRefresh()
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    Add default drink categories
                  </Button>
                )}
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
                  <Switch
                    id="new-cat-price-editable"
                    checked={newCatPriceEditable}
                    onCheckedChange={setNewCatPriceEditable}
                  />
                  <Label htmlFor="new-cat-price-editable" className="text-xs font-normal cursor-pointer">
                    Flexible price on POS (per order only)
                  </Label>
                </div>
              </div>
            )}
            <ul className="text-sm space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
              {sortedCategories.length === 0 ? (
                <li className="text-muted-foreground">No categories yet</li>
              ) : (
                sortedCategories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="min-w-0">
                      {c.parent_id ? '↳ ' : ''}
                      {toTitleCaseWords(c.name)}
                      {c.price_editable ? (
                        <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">
                          Flex price
                        </Badge>
                      ) : null}
                    </span>
                    {canManage && (
                      <span className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditCategory(c)}
                          title="Edit category"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleteCategory(c)}
                          title="Delete category"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        {canManage && department !== 'restaurant' ? (
          <Card>
            <CardHeader>
              <CardTitle>Add menu item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={form.category_id || '__none__'}
                  onValueChange={(v) => setForm((f) => ({ ...f, category_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Uncategorized</SelectItem>
                    {sortedCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.parent_id ? `↳ ${toTitleCaseWords(c.name)}` : toTitleCaseWords(c.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Price (₦)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.unit_price}
                  onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                  placeholder={form.price_editable ? 'Leave blank for price-at-sale items' : undefined}
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-2">
                <Switch
                  id="add-item-price-editable"
                  checked={form.price_editable}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, price_editable: v }))}
                />
                <Label htmlFor="add-item-price-editable" className="text-xs font-normal cursor-pointer leading-snug">
                  Flexible price at POS — cashier enters amount per order (leave price blank when it depends on the plate)
                </Label>
              </div>
              <OutletItemMetaFields
                value={{ description: form.description, tags: form.tags }}
                onChange={(meta) => setForm((f) => ({ ...f, ...meta }))}
                descriptionId="outlet-add-item-description"
              />
              <Button type="button" className="w-full" onClick={() => void addItem()} disabled={saving}>
                Add item
              </Button>
            </CardContent>
          </Card>
        ) : department === 'restaurant' ? (
          <Card>
            <CardHeader>
              <CardTitle>Restaurant dishes</CardTitle>
              <CardDescription>
                Food items are created only from Kitchen → New batch. Categories can still be managed
                here; batches sync to this menu automatically with portions and pricing.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Menu items</CardTitle>
              <CardDescription>Prices and categories are managed by front office leadership.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <Dialog open={!!editCategory} onOpenChange={(o) => !o && setEditCategory(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={editCatName}
                onChange={(e) => setEditCatName(titleCaseWhileTyping(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-2">
              <Switch
                id="edit-cat-price-editable"
                checked={editCatPriceEditable}
                onCheckedChange={setEditCatPriceEditable}
              />
              <Label htmlFor="edit-cat-price-editable" className="text-sm font-normal cursor-pointer leading-snug">
                Flexible price on POS — cashiers can change unit price in the cart for this order
                only; menu price stays the same.
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCategory(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCategory()} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit menu item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={editItemForm.name}
                onChange={(e) => setEditItemForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={editItemForm.category_id || '__none__'}
                onValueChange={(v) =>
                  setEditItemForm((f) => ({ ...f, category_id: v === '__none__' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Uncategorized</SelectItem>
                  {sortedCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.parent_id ? `↳ ${toTitleCaseWords(c.name)}` : toTitleCaseWords(c.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Price (₦)</Label>
              <Input
                type="number"
                min={0}
                value={editItemForm.unit_price}
                onChange={(e) => setEditItemForm((f) => ({ ...f, unit_price: e.target.value }))}
                placeholder={editItemForm.price_editable ? 'Leave blank for price-at-sale items' : undefined}
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-2">
              <Switch
                id="edit-item-price-editable"
                checked={editItemForm.price_editable}
                onCheckedChange={(v) => setEditItemForm((f) => ({ ...f, price_editable: v }))}
              />
              <Label htmlFor="edit-item-price-editable" className="text-sm font-normal cursor-pointer leading-snug">
                Flexible price at POS — cashier enters amount per order
              </Label>
            </div>
            <OutletItemMetaFields
              value={{ description: editItemForm.description, tags: editItemForm.tags }}
              onChange={(meta) => setEditItemForm((f) => ({ ...f, ...meta }))}
              descriptionId="outlet-edit-item-description"
            />
            <div className="flex items-center gap-2">
              <Switch checked={editItemActive} onCheckedChange={setEditItemActive} />
              <Label>Active on POS</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveItem()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stockEditItem} onOpenChange={(o) => !o && setStockEditItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust stock quantity</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Kickstart <strong>{stockEditItem?.name}</strong> for POS availability. Store supply
            will update this later when kitchen/bar stock changes.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                Available ({stockEditUnit}{Number(stockEditQty) === 1 ? '' : 's'})
              </Label>
              <Input
                type="number"
                min={0}
                value={stockEditQty}
                onChange={(e) => setStockEditQty(e.target.value)}
              />
            </div>
            {!stockEditItem?.service_code && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                This item is not linked yet — saving will create a stock link automatically.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockEditItem(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveStockQty()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save quantity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCategory} onOpenChange={(o) => !o && setDeleteCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteCategory?.name}&quot;? Sub-categories are removed. Items in this category become
              uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteCategory()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteItem &&
              department === 'main_bar' &&
              String(deleteItem.service_code ?? '').trim().toLowerCase().startsWith('bar:')
                ? 'Remove from Main Bar menu?'
                : 'Delete item?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteItem &&
              department === 'main_bar' &&
              String(deleteItem.service_code ?? '').trim().toLowerCase().startsWith('bar:') ? (
                <>
                  Remove &quot;{deleteItem.name}&quot; from the Main Bar menu? It stays in Central Store
                  and will not be re-added automatically.
                </>
              ) : (
                <>
                  Permanently remove &quot;{deleteItem?.name}&quot; from the menu? This cannot be undone.
                  {deleteItem && isKitchenSyncedMenuItem(deleteItem.service_code) && (
                    <>
                      {' '}
                      This item was synced from Kitchen — deleting here removes it from the menu only; batch
                      standards in Kitchen may still exist until removed there.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteItem()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
