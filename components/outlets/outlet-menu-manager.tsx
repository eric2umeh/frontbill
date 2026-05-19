'use client'

import { useState } from 'react'
import type { OutletMenuCategoryRow, OutletMenuItemRow } from '@/lib/outlets/types'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'

type Props = {
  department: OutletDepartmentKey
  categories: OutletMenuCategoryRow[]
  items: OutletMenuItemRow[]
  onRefresh: () => void
}

export function OutletMenuManager({ department, categories, items, onRefresh }: Props) {
  const [seeding, setSeeding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    unit_price: '',
    description: '',
  })

  const rootCategories = categories.filter((c) => !c.parent_id)

  const seedDefaults = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/outlets/seed-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  const addItem = async () => {
    if (!form.name.trim() || !form.unit_price) {
      toast.error('Name and price required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/outlets/menu/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department,
          name: form.name.trim(),
          category_id: form.category_id || null,
          unit_price: Number(form.unit_price),
          description: form.description,
          tags: ['available', 'ready_to_serve', 'alcohol'],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed')
        return
      }
      toast.success('Item added')
      setForm({ name: '', category_id: '', unit_price: '', description: '' })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (item: OutletMenuItemRow, active: boolean) => {
    const res = await fetch('/api/outlets/menu/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, is_active: active }),
    })
    if (!res.ok) {
      toast.error('Update failed')
      return
    }
    onRefresh()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Group items (e.g. Red Wine, Gentlemen → Normal Laundry).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => void seedDefaults()} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Load default category list
          </Button>
          <div className="flex gap-2">
            <Input placeholder="New category name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
            <Button type="button" onClick={() => void addCategory()} disabled={saving}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="text-sm space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
            {categories.length === 0 ? (
              <li className="text-muted-foreground">No categories yet</li>
            ) : (
              categories.map((c) => (
                <li key={c.id}>
                  {c.parent_id ? '↳ ' : ''}
                  {c.name}
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>

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
            <Select value={form.category_id || '__none__'} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v === '__none__' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
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
            <Input type="number" min={0} value={form.unit_price} onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))} />
          </div>
          <Button type="button" className="w-full" onClick={() => void addItem()} disabled={saving}>
            Add item
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
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
                        <Switch checked={it.is_active} onCheckedChange={(v) => void toggleActive(it, v)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
