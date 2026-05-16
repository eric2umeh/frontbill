'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

type Category = {
  id: string
  code: string
  name: string
  sort_order: number
  department_hint?: string | null
  is_active?: boolean
}

interface Props {
  userId: string
  canManage: boolean
}

function emptyForm() {
  return { name: '', department_hint: '', sort_order: '500' }
}

export function ExpenseCategoriesManager({ userId, canManage }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/expenses/categories?caller_id=${userId}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCategories(json.categories || [])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (cat: Category) => {
    setEditing(cat)
    setForm({
      name: cat.name,
      department_hint: cat.department_hint || '',
      sort_order: String(cat.sort_order ?? 500),
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const name = form.name.trim()
    if (!name) {
      toast.error('Category name is required')
      return
    }
    setSubmitting(true)
    try {
      if (editing) {
        const res = await fetch('/api/expenses/categories', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            caller_id: userId,
            category_id: editing.id,
            name,
            sort_order: Number(form.sort_order) || 500,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        toast.success('Category updated')
      } else {
        const res = await fetch('/api/expenses/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            caller_id: userId,
            name,
            sort_order: Number(form.sort_order) || 500,
            department_hint: form.department_hint.trim() || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        toast.success('Category added')
      }
      setDialogOpen(false)
      void load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (cat: Category) => {
    try {
      const res = await fetch('/api/expenses/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caller_id: userId,
          category_id: cat.id,
          is_active: cat.is_active === false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(cat.is_active === false ? 'Category reactivated' : 'Category deactivated')
      void load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/expenses/categories?caller_id=${userId}&category_id=${deleteTarget.id}`,
        { method: 'DELETE', credentials: 'include' },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.deactivated) {
        toast.message(json.message || 'Category deactivated (has expense history)')
      } else {
        toast.success('Category deleted')
      }
      setDeleteTarget(null)
      void load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const active = categories.filter((c) => c.is_active !== false)
  const inactive = categories.filter((c) => c.is_active === false)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Categories appear when adding expenses. Inactive categories stay on old records but won&apos;t show in new
          entries.
        </p>
        {canManage && (
          <Button type="button" className="w-full shrink-0 sm:w-auto" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add category
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {active.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No active categories. {canManage ? 'Add one to start recording expenses.' : ''}
            </CardContent>
          </Card>
        ) : (
          active.map((cat) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              canManage={canManage}
              onEdit={() => openEdit(cat)}
              onDelete={() => setDeleteTarget(cat)}
              onToggle={() => void toggleActive(cat)}
            />
          ))
        )}
      </div>

      {inactive.length > 0 && (
        <div className="space-y-2 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inactive</p>
          {inactive.map((cat) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              canManage={canManage}
              onEdit={() => openEdit(cat)}
              onDelete={() => setDeleteTarget(cat)}
              onToggle={() => void toggleActive(cat)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && !submitting && setDialogOpen(false)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'Add category'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Rename or reorder this category.' : 'New categories are available immediately when adding expenses.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cat_name">Name *</Label>
              <Input
                id="cat_name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Diesel / fuel"
              />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="cat_dept">Department hint (optional)</Label>
                <Input
                  id="cat_dept"
                  value={form.department_hint}
                  onChange={(e) => setForm((f) => ({ ...f, department_hint: e.target.value }))}
                  placeholder="e.g. Kitchen, Housekeeping"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="cat_sort">Sort order</Label>
              <Input
                id="cat_sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first in lists.</p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSave()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save' : 'Add category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove category?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.name}” will be deleted if unused, or deactivated if it has expense history.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CategoryRow({
  cat,
  canManage,
  onEdit,
  onDelete,
  onToggle,
}: {
  cat: Category
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <Card className={cat.is_active === false ? 'opacity-70' : undefined}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{cat.name}</p>
            {cat.is_active === false && (
              <Badge variant="secondary" className="text-xs">
                Inactive
              </Badge>
            )}
          </div>
          {cat.department_hint ? (
            <p className="text-xs text-muted-foreground mt-0.5">{cat.department_hint}</p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-0.5">Code: {cat.code}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onToggle}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {cat.is_active === false ? 'Activate' : 'Deactivate'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
