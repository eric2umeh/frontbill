'use client'

import { useState } from 'react'
import type { OutletMenuCategoryRow, OutletMenuItemRow } from '@/lib/outlets/types'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'

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
}

export function OutletMenuManager({ department, categories, items, canManage, onRefresh }: Props) {
  const [seeding, setSeeding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [form, setForm] = useState(emptyItemForm)

  const [editCategory, setEditCategory] = useState<OutletMenuCategoryRow | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [deleteCategory, setDeleteCategory] = useState<OutletMenuCategoryRow | null>(null)

  const [editItem, setEditItem] = useState<OutletMenuItemRow | null>(null)
  const [editItemForm, setEditItemForm] = useState(emptyItemForm)
  const [editItemActive, setEditItemActive] = useState(true)
  const [deleteItem, setDeleteItem] = useState<OutletMenuItemRow | null>(null)

  const openEditCategory = (c: OutletMenuCategoryRow) => {
    setEditCategory(c)
    setEditCatName(c.name)
  }

  const openEditItem = (it: OutletMenuItemRow) => {
    setEditItem(it)
    setEditItemForm({
      name: it.name,
      category_id: it.category_id || '',
      unit_price: String(it.unit_price),
      description: it.description || '',
    })
    setEditItemActive(it.is_active)
  }

  const seedDefaults = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/outlets/seed-menu', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ department }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Seed failed — run scripts/050_outlet_menu.sql in Supabase first')
        return
      }
      toast.success(`Added ${json.inserted ?? 0} categories`)
      onRefresh()
    } finally {
      setSeeding(false)
    }
  }

  const addCategory = async () => {
    if (!newCatName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/outlets/menu/categories', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ department, name: newCatName.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed')
        return
      }
      toast.success('Category added')
      setNewCatName('')
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
        body: JSON.stringify({ id: editCategory.id, name: editCatName.trim() }),
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
    if (!form.name.trim() || !form.unit_price) {
      toast.error('Name and price required')
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
          unit_price: Number(form.unit_price),
          description: form.description,
          tags: ['available', 'ready_to_serve'],
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
    if (!editItem || !editItemForm.name.trim() || !editItemForm.unit_price) {
      toast.error('Name and price required')
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
          unit_price: Number(editItemForm.unit_price),
          description: editItemForm.description,
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
      {!canManage && (
        <p className="text-sm text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2">
          View only. Superadmin, Administrator, or Manager can add, edit, or delete categories and items.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Group items (e.g. Red Wine, Main dishes).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => void seedDefaults()}
                  disabled={seeding}
                >
                  {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Load default category list
                </Button>
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
              </>
            )}
            <ul className="text-sm space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
              {categories.length === 0 ? (
                <li className="text-muted-foreground">No categories yet</li>
              ) : (
                categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-0.5">
                    <span>
                      {c.parent_id ? '↳ ' : ''}
                      {c.name}
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
                    {categories.map((c) => (
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
                />
              </div>
              <div className="space-y-1">
                <Label>Description (optional)</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-right p-2">Price</th>
                  <th className="p-2">Active</th>
                  {canManage && <th className="p-2 w-24">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const cat = categories.find((c) => c.id === it.category_id)
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-2 font-medium">{it.name}</td>
                      <td className="p-2 text-muted-foreground">{cat?.name ?? '—'}</td>
                      <td className="p-2 text-right font-mono">{formatNaira(it.unit_price)}</td>
                      <td className="p-2 text-center">
                        <Switch
                          checked={it.is_active}
                          disabled={!canManage}
                          onCheckedChange={(v) => void toggleActive(it, v)}
                        />
                      </td>
                      {canManage && (
                        <td className="p-2">
                          <div className="flex justify-center gap-0.5">
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
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editCategory} onOpenChange={(o) => !o && setEditCategory(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} />
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
                  {categories.map((c) => (
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
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={editItemForm.description}
                onChange={(e) => setEditItemForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
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
              Permanently remove &quot;{deleteItem?.name}&quot; from the menu? This cannot be undone.
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
