'use client'

import { useMemo, useState } from 'react'
import type { OutletMenuCategoryRow, OutletMenuItemRow } from '@/lib/outlets/types'
import { isStoreControlledFnbOutlet, type OutletDepartmentKey } from '@/lib/outlets/departments'
import { itemAllowsPosPriceEdit } from '@/lib/outlets/category-price-editable'
import { isKitchenSyncedMenuItem } from '@/lib/supply-chain/kitchen-menu-link'
import { useAuth } from '@/lib/auth-context'
import { canKickstartOutletStock, canonicalRoleKey } from '@/lib/permissions'
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

type Props = {
  department: OutletDepartmentKey
  categories: OutletMenuCategoryRow[]
  items: OutletMenuItemRow[]
  canManage: boolean
  onRefresh: () => void
}

const emptyItemForm = {
  name: '',
  category_id: '',
  unit_price: '',
  description: '',
  tags: [] as string[],
  price_editable: false,
}

function parseItemUnitPrice(raw: string, priceEditable: boolean): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return priceEditable ? 0 : null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function OutletMenuManager({ department, categories, items, canManage, onRefresh }: Props) {
  const { name: staffName, role } = useAuth()
  const supply = useSupplyChain()
  const stockPipeline = outletStockSource(department)
  const storeControlledFnb = isStoreControlledFnbOutlet(department)
  const showOutletQty = stockPipeline !== 'none'
  const canAdjustStock = canKickstartOutletStock(role) && storeControlledFnb
  const actor = { name: staffName ?? 'Staff', role: canonicalRoleKey(role) ?? 'staff' }
  const sortedCategories = useMemo(() => sortOutletMenuByName(categories), [categories])
  const sortedItems = useMemo(() => sortOutletMenuByName(items), [items])
  const [itemSearch, setItemSearch] = useState('')
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string>('all')
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    return sortedItems.filter((it) => {
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
  }, [sortedItems, sortedCategories, itemSearch, itemCategoryFilter])
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

  const openEditCategory = (c: OutletMenuCategoryRow) => {
    setEditCategory(c)
    setEditCatName(c.name)
    setEditCatPriceEditable(!!c.price_editable)
  }

  const openStockEdit = (it: OutletMenuItemRow) => {
    const link = supply.getOutletItemStock(department, it)
    setStockEditItem(it)
    setStockEditQty(String(link.tracked ? link.available : 0))
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
    setEditItemForm({
      name: it.name,
      category_id: it.category_id || '',
      unit_price: String(it.unit_price),
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
          name: newCatName.trim(),
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
          name: editCatName.trim(),
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
    const unitPrice = parseItemUnitPrice(form.unit_price, form.price_editable)
    if (!form.name.trim() || unitPrice == null) {
      toast.error(
        form.price_editable
          ? 'Name required. For price-at-sale items, leave price blank or enter 0.'
          : 'Name and price required',
      )
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
    const unitPrice = parseItemUnitPrice(editItemForm.unit_price, editItemForm.price_editable)
    if (!editItem || !editItemForm.name.trim() || unitPrice == null) {
      toast.error(
        editItemForm.price_editable
          ? 'Name required. For price-at-sale items, leave price blank or enter 0.'
          : 'Name and price required',
      )
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
      toast.success('Item updated')
      setEditItem(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteItem = async () => {
    if (!deleteItem) return
    setSaving(true)
    try {
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
      {['restaurant', 'main_bar', 'pool_bar', 'banquets'].includes(department) && (
        <p className="text-sm text-muted-foreground rounded-lg border border-sky-200 bg-sky-50/70 dark:bg-sky-950/20 px-3 py-2">
          Items like <strong>Rice only</strong> or other extras that are priced with a main plate do not need a
          fixed menu price. Turn on <strong>Flexible price at POS</strong> for that item (or its category), set
          list price to ₦0, and the cashier enters the amount when ordering.
        </p>
      )}
      {!canManage && (
        <p className="text-sm text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2">
          View only. Superadmin, Administrator, or Manager can add, edit, or delete categories and items.
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
                ? 'Qty from kitchen/bar stock. Admin/Manager can kickstart quantities here until store supply updates them.'
                : stockPipeline === 'kitchen'
                  ? 'Qty = kitchen portions (store → batch → prepared food).'
                  : 'Qty = bar stock issued from central store after PO retirement.'}
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
                {c.parent_id ? `↳ ${c.name}` : c.name}
              </Button>
            ))}
          </div>
          <div className="border rounded-md overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Category</th>
                  {showOutletQty && <th className="text-right p-2">Qty available</th>}
                  <th className="text-right p-2">Price</th>
                  <th className="p-2">Active</th>
                  {(canManage || canAdjustStock) && <th className="p-2 w-28">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(canManage || canAdjustStock ? 5 : 4) + (showOutletQty ? 1 : 0)}
                      className="p-4 text-center text-muted-foreground"
                    >
                      No items match your search or category filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it) => {
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
                      <td className="p-2 text-muted-foreground">{cat?.name ?? '—'}</td>
                      {showOutletQty && (
                        <td className="p-2 text-right">
                          {stockLink ? (
                            <span className="inline-flex flex-col items-end gap-0.5">
                              <span className={qtyLevel ? stockLevelTextClass(qtyLevel) : 'text-muted-foreground text-xs'}>
                                {qtyLabel}
                              </span>
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
                        {itemAllowsPosPriceEdit(it, sortedCategories) && Number(it.unit_price) === 0
                          ? '—'
                          : formatNaira(it.unit_price)}
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
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              Group items (e.g. Buffet, Banquets). Enable flexible POS price for categories where
              the cashier may change the amount per order only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="New category name"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void addCategory()}
                  />
                  <Button type="button" onClick={() => void addCategory()} disabled={saving}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
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
                      {c.name}
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

        {canManage ? (
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
                        {c.parent_id ? `↳ ${c.name}` : c.name}
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
                  placeholder={form.price_editable ? '0 for price-at-sale items' : undefined}
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-2">
                <Switch
                  id="add-item-price-editable"
                  checked={form.price_editable}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, price_editable: v }))}
                />
                <Label htmlFor="add-item-price-editable" className="text-xs font-normal cursor-pointer leading-snug">
                  Flexible price at POS — cashier enters amount per order (use ₦0 when price depends on the plate)
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
              <Input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} />
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
                      {c.parent_id ? `↳ ${c.name}` : c.name}
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
                placeholder={editItemForm.price_editable ? '0 for price-at-sale items' : undefined}
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
              Save
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
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove &quot;{deleteItem?.name}&quot; from the Restaurant menu? This cannot be
              undone.
              {deleteItem && isKitchenSyncedMenuItem(deleteItem.service_code) && (
                <>
                  {' '}
                  This item was synced from Kitchen — deleting here removes it from the menu only; batch
                  standards in Kitchen may still exist until removed there.
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
