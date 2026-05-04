'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { formatNaira } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import { OUTLET_DEPARTMENTS } from '@/lib/store/outlet-departments'
import type {
  StoreCategoryRow,
  StoreItemRow,
  MovementRow,
  StoreMovementType,
} from '@/lib/store/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  History,
  Layers,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingDown,
} from 'lucide-react'

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'category'
  )
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 7)
}

export function StoreManager() {
  const { role, userId, organizationId } = useAuth()
  const canCreate = hasPermission(role, 'store:create')
  const canEdit = hasPermission(role, 'store:edit')
  const canDelete = hasPermission(role, 'store:delete')
  const canAdjust = hasPermission(role, 'store:adjust')
  const canIssue = hasPermission(role, 'store:issue')
  const canReports = hasPermission(role, 'store:reports')
  const canAuditTab = hasPermission(role, 'store:audit')
  const canSystemAudit = hasPermission(role, 'audit_trails:view')

  const [categories, setCategories] = useState<StoreCategoryRow[]>([])
  const [items, setItems] = useState<StoreItemRow[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [inactiveToo, setInactiveToo] = useState(false)
  const [tab, setTab] = useState<
    'inventory' | 'categories' | 'movements' | 'daily' | 'audit'
  >('inventory')

  const [reportDate, setReportDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [dailyMovements, setDailyMovements] = useState<MovementRow[]>([])
  const [auditMovements, setAuditMovements] = useState<MovementRow[]>([])
  const [loadingDaily, setLoadingDaily] = useState(false)
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [staffById, setStaffById] = useState<Record<string, string>>({})

  const [adjustDept, setAdjustDept] = useState('')
  const [adjustReceivedBy, setAdjustReceivedBy] = useState<string>('')

  const [catDialog, setCatDialog] = useState(false)
  const [editingCat, setEditingCat] = useState<StoreCategoryRow | null>(null)
  const [catForm, setCatForm] = useState({ name: '', sort_order: 0 })
  const [catSaving, setCatSaving] = useState(false)

  const [itemDialog, setItemDialog] = useState(false)
  const [editingItem, setEditingItem] = useState<StoreItemRow | null>(null)
  const [itemForm, setItemForm] = useState({
    name: '',
    sku: '',
    unit: 'pcs',
    category_id: '' as string,
    quantity_on_hand: 0,
    reorder_level: 0,
    unit_price: 0,
    is_active: true,
    notes: '',
  })
  const [itemSaving, setItemSaving] = useState(false)

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StoreItemRow | null>(null)
  const [adjustType, setAdjustType] = useState<StoreMovementType>('in')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustRef, setAdjustRef] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjustTarget, setAdjustTarget] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)

  const [deleteCat, setDeleteCat] = useState<StoreCategoryRow | null>(null)
  const [deleteItem, setDeleteItem] = useState<StoreItemRow | null>(null)

  const fetchAll = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [{ data: c, error: e1 }, { data: i, error: e2 }, { data: m, error: e3 }] = await Promise.all([
        supabase
          .from('store_categories')
          .select('*')
          .eq('organization_id', organizationId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('store_items')
          .select('*')
          .eq('organization_id', organizationId)
          .order('name', { ascending: true }),
        supabase
          .from('store_stock_movements')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3

      setCategories((c || []) as StoreCategoryRow[])
      setItems((i || []) as StoreItemRow[])
      setMovements((m || []) as MovementRow[])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load store data'
      toast.error(msg)
      setCategories([])
      setItems([])
      setMovements([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  useEffect(() => {
    const supabase = createClient()
    if (!supabase || !organizationId) return
    void supabase
      .from('profiles')
      .select('id, full_name')
      .eq('organization_id', organizationId)
      .then((res: { data: { id: string; full_name: string | null }[] | null }) => {
        const m: Record<string, string> = {}
        res.data?.forEach(p => {
          m[p.id] = p.full_name || p.id.slice(0, 8)
        })
        setStaffById(m)
      })
  }, [organizationId])

  useEffect(() => {
    if (tab !== 'daily' || !organizationId) return
    const supabase = createClient()
    if (!supabase) return
    setLoadingDaily(true)
    const day = parseISO(reportDate)
    const start = startOfDay(day).toISOString()
    const end = endOfDay(day).toISOString()
    void supabase
      .from('store_stock_movements')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', start)
      .lte('created_at', end)
      .then((res: { data: unknown; error: { message: string } | null }) => {
        if (!res.error) setDailyMovements((res.data as MovementRow[]) || [])
        setLoadingDaily(false)
      })
  }, [tab, reportDate, organizationId])

  useEffect(() => {
    if (tab !== 'audit' || !organizationId) return
    const supabase = createClient()
    if (!supabase) return
    setLoadingAudit(true)
    void supabase
      .from('store_stock_movements')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1500)
      .then((res: { data: unknown; error: { message: string } | null }) => {
        if (!res.error) setAuditMovements((res.data as MovementRow[]) || [])
        setLoadingAudit(false)
      })
  }, [tab, organizationId])

  const categoryById = useMemo(() => {
    const m = new Map<string, StoreCategoryRow>()
    categories.forEach(c => m.set(c.id, c))
    return m
  }, [categories])

  const itemNameById = useMemo(() => {
    const m = new Map<string, string>()
    items.forEach(i => m.set(i.id, i.name))
    return m
  }, [items])

  const dailyDeptSummary = useMemo(() => {
    const salesLike = dailyMovements.filter(m =>
      ['sale', 'issue', 'out'].includes(m.movement_type)
    )
    const byDept: Record<string, { qty: number; value: number }> = {}
    for (const m of salesLike) {
      const item = items.find(i => i.id === m.item_id)
      const dept = (m.destination_department || '').trim() || '— Unassigned outlet'
      const qtyAbs = Math.abs(Number(m.quantity))
      const val = qtyAbs * Number(item?.unit_price || 0)
      if (!byDept[dept]) byDept[dept] = { qty: 0, value: 0 }
      byDept[dept].qty += qtyAbs
      byDept[dept].value += val
    }
    return Object.entries(byDept).sort((a, b) => a[0].localeCompare(b[0]))
  }, [dailyMovements, items])

  const dailyCategorySummary = useMemo(() => {
    const salesLike = dailyMovements.filter(m =>
      ['sale', 'issue', 'out'].includes(m.movement_type)
    )
    const byCat: Record<string, { qty: number; value: number }> = {}
    for (const m of salesLike) {
      const item = items.find(i => i.id === m.item_id)
      const cat =
        item?.category_id && categoryById.get(item.category_id)
          ? categoryById.get(item.category_id)!.name
          : 'Uncategorized'
      const qtyAbs = Math.abs(Number(m.quantity))
      const val = qtyAbs * Number(item?.unit_price || 0)
      if (!byCat[cat]) byCat[cat] = { qty: 0, value: 0 }
      byCat[cat].qty += qtyAbs
      byCat[cat].value += val
    }
    return Object.entries(byCat).sort((a, b) => a[0].localeCompare(b[0]))
  }, [dailyMovements, items, categoryById])

  const closingByCategory = useMemo(() => {
    const map: Record<string, { qty: number; value: number }> = {}
    items
      .filter(i => i.is_active)
      .forEach(i => {
        const label =
          i.category_id && categoryById.get(i.category_id)
            ? categoryById.get(i.category_id)!.name
            : 'Uncategorized'
        if (!map[label]) map[label] = { qty: 0, value: 0 }
        const q = Number(i.quantity_on_hand)
        map[label].qty += q
        map[label].value += q * Number(i.unit_price || 0)
      })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items, categoryById])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(it => {
      if (!inactiveToo && !it.is_active) return false
      if (catFilter !== 'all') {
        if (catFilter === 'none') {
          if (it.category_id) return false
        } else if (it.category_id !== catFilter) return false
      }
      if (!q) return true
      const sku = (it.sku || '').toLowerCase()
      return (
        it.name.toLowerCase().includes(q) ||
        sku.includes(q) ||
        (it.notes && it.notes.toLowerCase().includes(q))
      )
    })
  }, [items, search, catFilter, inactiveToo])

  const stats = useMemo(() => {
    const active = items.filter(i => i.is_active)
    const low = active.filter(
      i => i.reorder_level > 0 && Number(i.quantity_on_hand) <= Number(i.reorder_level)
    )
    const totalSku = active.length
    const value = active.reduce(
      (sum, i) => sum + Number(i.quantity_on_hand) * Number(i.unit_price || 0),
      0
    )
    return { totalSku, lowCount: low.length, stockValue: value }
  }, [items])

  const openNewCategory = () => {
    setEditingCat(null)
    setCatForm({ name: '', sort_order: categories.length * 10 })
    setCatDialog(true)
  }

  const openEditCategory = (c: StoreCategoryRow) => {
    setEditingCat(c)
    setCatForm({ name: c.name, sort_order: c.sort_order })
    setCatDialog(true)
  }

  const saveCategory = async () => {
    const supabase = createClient()
    if (!supabase || !organizationId || !catForm.name.trim()) {
      toast.error('Category name is required')
      return
    }
    setCatSaving(true)
    try {
      const baseSlug = slugify(catForm.name)
      let slug = baseSlug
      if (editingCat && editingCat.slug === slug) {
        slug = editingCat.slug
      } else {
        const clash = categories.some(c => c.slug === slug && c.id !== editingCat?.id)
        if (clash) slug = `${baseSlug}-${randomSuffix()}`
      }

      if (editingCat) {
        const { error } = await supabase
          .from('store_categories')
          .update({
            name: catForm.name.trim(),
            slug,
            sort_order: catForm.sort_order,
            updated_by: userId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCat.id)
        if (error) throw error
        toast.success('Category updated')
      } else {
        const { error } = await supabase.from('store_categories').insert({
          organization_id: organizationId,
          name: catForm.name.trim(),
          slug,
          sort_order: catForm.sort_order,
          created_by: userId || null,
        })
        if (error) throw error
        toast.success('Category created')
      }
      setCatDialog(false)
      await fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setCatSaving(false)
    }
  }

  const removeCategory = async () => {
    if (!deleteCat) return
    const supabase = createClient()
    if (!supabase) return
    setCatSaving(true)
    try {
      const { error } = await supabase.from('store_categories').delete().eq('id', deleteCat.id)
      if (error) throw error
      toast.success('Category removed (items uncategorized)')
      setDeleteCat(null)
      await fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setCatSaving(false)
    }
  }

  const openNewItem = () => {
    setEditingItem(null)
    setItemForm({
      name: '',
      sku: '',
      unit: 'pcs',
      category_id: catFilter !== 'all' && catFilter !== 'none' ? catFilter : '',
      quantity_on_hand: 0,
      reorder_level: 5,
      unit_price: 0,
      is_active: true,
      notes: '',
    })
    setItemDialog(true)
  }

  const openEditItem = (it: StoreItemRow) => {
    setEditingItem(it)
    setItemForm({
      name: it.name,
      sku: it.sku || '',
      unit: it.unit,
      category_id: it.category_id || '',
      quantity_on_hand: Number(it.quantity_on_hand),
      reorder_level: Number(it.reorder_level),
      unit_price: Number(it.unit_price),
      is_active: it.is_active,
      notes: it.notes || '',
    })
    setItemDialog(true)
  }

  const saveItem = async () => {
    const supabase = createClient()
    if (!supabase || !organizationId || !itemForm.name.trim()) {
      toast.error('Item name is required')
      return
    }
    setItemSaving(true)
    try {
      const payload = {
        organization_id: organizationId,
        name: itemForm.name.trim(),
        sku: itemForm.sku.trim() || null,
        unit: itemForm.unit.trim() || 'pcs',
        category_id: itemForm.category_id || null,
        quantity_on_hand: Math.max(0, Number(itemForm.quantity_on_hand) || 0),
        reorder_level: Math.max(0, Number(itemForm.reorder_level) || 0),
        unit_price: Math.max(0, Number(itemForm.unit_price) || 0),
        is_active: itemForm.is_active,
        notes: itemForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (editingItem) {
        const { error } = await supabase
          .from('store_items')
          .update({
            ...payload,
            updated_by: userId || null,
          })
          .eq('id', editingItem.id)
        if (error) throw error
        toast.success('Item updated')
      } else {
        const { error } = await supabase.from('store_items').insert({
          ...payload,
          created_by: userId || null,
        })
        if (error) throw error
        toast.success('Item created')
      }
      setItemDialog(false)
      await fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setItemSaving(false)
    }
  }

  const removeItem = async () => {
    if (!deleteItem) return
    const supabase = createClient()
    if (!supabase) return
    setItemSaving(true)
    try {
      const { error } = await supabase.from('store_items').delete().eq('id', deleteItem.id)
      if (error) throw error
      toast.success('Item deleted')
      setDeleteItem(null)
      await fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setItemSaving(false)
    }
  }

  const openAdjust = (it: StoreItemRow) => {
    setAdjustItem(it)
    setAdjustType('in')
    setAdjustQty('')
    setAdjustRef('')
    setAdjustNotes('')
    setAdjustTarget('')
    setAdjustDept('')
    setAdjustReceivedBy('')
    setAdjustOpen(true)
  }

  const applyMovement = async () => {
    if (!adjustItem || !organizationId || !userId) return
    const supabase = createClient()
    if (!supabase) return

    const prev = Number(adjustItem.quantity_on_hand)
    let nextQty = prev
    let movementQty = 0
    const mtype: StoreMovementType = adjustType

    if (mtype === 'issue') {
      if (!canIssue) {
        toast.error('You do not have permission to issue stock to outlets')
        return
      }
      if (!adjustDept.trim()) {
        toast.error('Select an outlet / department for an issue')
        return
      }
    }

    if (mtype === 'adjustment') {
      const target = parseFloat(adjustTarget)
      if (Number.isNaN(target) || target < 0) {
        toast.error('Enter a valid target quantity (0 or greater)')
        return
      }
      nextQty = target
      movementQty = target - prev
    } else {
      const q = parseFloat(adjustQty)
      if (Number.isNaN(q) || q <= 0) {
        toast.error('Enter a positive quantity')
        return
      }
      if (mtype === 'in') {
        nextQty = prev + q
        movementQty = q
      } else {
        nextQty = prev - q
        movementQty = -q
        if (nextQty < 0) {
          toast.error('Not enough stock on hand')
          return
        }
      }
    }

    const dept = adjustDept.trim() || null
    const recv = adjustReceivedBy || null

    setAdjustSaving(true)
    try {
      const { data: inserted, error: insErr } = await supabase
        .from('store_stock_movements')
        .insert({
          organization_id: organizationId,
          item_id: adjustItem.id,
          movement_type: mtype,
          quantity: movementQty,
          balance_after: nextQty,
          reference: adjustRef.trim() || null,
          notes: adjustNotes.trim() || null,
          created_by: userId,
          destination_department: dept,
          received_by: recv,
        })
        .select('id')
        .single()

      if (insErr) throw insErr

      const { error: upErr } = await supabase
        .from('store_items')
        .update({
          quantity_on_hand: nextQty,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', adjustItem.id)

      if (upErr) {
        if (inserted?.id) {
          await supabase.from('store_stock_movements').delete().eq('id', inserted.id)
        }
        throw upErr
      }

      toast.success('Stock updated')
      setAdjustOpen(false)
      await fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setAdjustSaving(false)
    }
  }

  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Store</CardTitle>
          <CardDescription>Your profile needs an organization to manage inventory.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border bg-gradient-to-br',
          'from-amber-50 via-orange-50/80 to-stone-100',
          'dark:from-amber-950/40 dark:via-orange-950/20 dark:to-stone-950'
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-orange-400/15 blur-2xl" />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-8">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/60 bg-white/60 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm dark:border-amber-800/40 dark:bg-stone-900/60 dark:text-amber-100">
              <Sparkles className="h-3.5 w-3.5" />
              Hotel store & inventory
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">General store</h1>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              Receiving into categories, issuing to outlets, daily consumption, and full movement accountability.
            </p>
            {canSystemAudit && (
              <p className="text-sm">
                <Link
                  href="/night-audit"
                  className="inline-flex items-center gap-1 font-medium text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  System audit trails (Night Audit)
                </Link>
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border bg-white/70 px-4 py-3 shadow-sm dark:bg-stone-900/70">
              <p className="text-2xl font-bold tabular-nums">{stats.totalSku}</p>
              <p className="text-xs text-muted-foreground">Active SKUs</p>
            </div>
            <div className="rounded-xl border bg-white/70 px-4 py-3 shadow-sm dark:bg-stone-900/70">
              <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{stats.lowCount}</p>
              <p className="text-xs text-muted-foreground">Low stock</p>
            </div>
            <div className="rounded-xl border bg-white/70 px-4 py-3 shadow-sm dark:bg-stone-900/70">
              <p className="text-sm font-bold leading-tight">{formatNaira(stats.stockValue)}</p>
              <p className="text-xs text-muted-foreground">Est. value</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="space-y-6">
          <TabsList className="flex h-auto min-h-10 w-full flex-wrap gap-1 md:w-auto md:inline-flex">
            <TabsTrigger value="inventory" className="gap-2">
              <Package className="h-4 w-4" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Layers className="h-4 w-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="movements" className="gap-2">
              <History className="h-4 w-4" />
              Movements
            </TabsTrigger>
            {canReports && (
              <TabsTrigger value="daily" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Daily / closing
              </TabsTrigger>
            )}
            {canAuditTab && (
              <TabsTrigger value="audit" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                Audit trail
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="inventory" className="space-y-4">
            <Card className="border-dashed">
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search name, SKU, notes..."
                      className="pl-9"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={catFilter} onValueChange={setCatFilter}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={inactiveToo} onCheckedChange={setInactiveToo} />
                    Show inactive
                  </label>
                  {canCreate && (
                    <Button onClick={openNewItem} className="gap-2 bg-amber-600 hover:bg-amber-700">
                      <Plus className="h-4 w-4" />
                      Add item
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Stock sheet</CardTitle>
                <CardDescription>
                  {filteredItems.length} line{filteredItems.length !== 1 ? 's' : ''} — click adjust to record ins,
                  outs, sales, or a physical count.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[min(560px,70vh)] md:h-[min(640px,72vh)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden lg:table-cell">Category</TableHead>
                        <TableHead className="text-right">Qty Stock</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Reorder</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">Unit price</TableHead>
                        <TableHead className="w-[140px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map(it => {
                        const cat = it.category_id ? categoryById.get(it.category_id) : null
                        const low =
                          it.is_active &&
                          it.reorder_level > 0 &&
                          Number(it.quantity_on_hand) <= Number(it.reorder_level)
                        return (
                          <TableRow key={it.id} className={cn(!it.is_active && 'opacity-60')}>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Link href={`/store/items/${it.id}`} className="font-medium hover:underline">
                                  {it.name}
                                </Link>
                                <div className="flex flex-wrap items-center gap-2">
                                  {it.sku && (
                                    <Badge variant="outline" className="text-xs font-normal">
                                      {it.sku}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">{it.unit}</span>
                                  {!it.is_active && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      Inactive
                                    </Badge>
                                  )}
                                  {low && (
                                    <Badge className="bg-amber-600 text-[10px] hover:bg-amber-600">
                                      Low
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground">
                              {cat?.name ?? '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-base font-semibold">
                              {Number(it.quantity_on_hand).toLocaleString()}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground">
                              {Number(it.reorder_level).toLocaleString()}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-right text-sm">
                              {formatNaira(Number(it.unit_price))}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {canAdjust && (
                                  <Button variant="outline" size="sm" className="h-8" onClick={() => openAdjust(it)}>
                                    <TrendingDown className="mr-1 h-3.5 w-3.5" />
                                    Adjust
                                  </Button>
                                )}
                                {canEdit && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditItem(it)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => setDeleteItem(it)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {filteredItems.length === 0 && (
                  <p className="py-12 text-center text-sm text-muted-foreground">No items match this view.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="flex justify-end">
              {canCreate && (
                <Button onClick={openNewCategory} className="gap-2 bg-amber-600 hover:bg-amber-700">
                  <Plus className="h-4 w-4" />
                  New category
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map(c => {
                const count = items.filter(i => i.category_id === c.id).length
                return (
                  <Card key={c.id} className="group border transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug">{c.name}</CardTitle>
                        <Badge variant="secondary" className="shrink-0">
                          {count} items
                        </Badge>
                      </div>
                      <CardDescription className="font-mono text-xs">{c.slug}</CardDescription>
                      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                        {c.created_by && <p>Added by: {staffById[c.created_by] || '—'}</p>}
                        {c.updated_by && <p>Updated by: {staffById[c.updated_by] || '—'}</p>}
                      </div>
                    </CardHeader>
                    <CardContent className="flex justify-end gap-2 pt-0">
                      {canEdit && (
                        <Button variant="outline" size="sm" onClick={() => openEditCategory(c)}>
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteCat(c)}>
                          Delete
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
            {categories.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No categories yet. Create sections such as General Store, Housekeeping, Bar, Kitchen, and F&amp;B
                  inventory.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="movements" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Recent movements</CardTitle>
                <CardDescription>Last 200 transactions across the ledger.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[min(480px,60vh)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Δ Qty</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="hidden lg:table-cell">Dept / outlet</TableHead>
                        <TableHead className="hidden md:table-cell">Ref / notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map(m => {
                        const name = itemNameById.get(m.item_id) || '—'
                        const icon =
                          m.movement_type === 'in'
                            ? ArrowUpRight
                            : m.movement_type === 'adjustment'
                              ? SlidersHorizontal
                              : ArrowDownRight
                        const Icon = icon
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {format(parseISO(m.created_at), 'MMM d, HH:mm')}
                            </TableCell>
                            <TableCell className="font-medium">
                              <Link href={`/store/items/${m.item_id}`} className="hover:underline">
                                {name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="capitalize">{m.movement_type.replace('_', ' ')}</span>
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {Number(m.quantity) > 0 ? '+' : ''}
                              {Number(m.quantity).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {m.balance_after != null ? Number(m.balance_after).toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm">
                              {m.destination_department || '—'}
                            </TableCell>
                            <TableCell className="hidden md:table-cell max-w-[200px] truncate text-xs text-muted-foreground">
                              {[m.reference, m.notes].filter(Boolean).join(' · ') || '—'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {movements.length === 0 && (
                  <p className="py-12 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canReports && (
            <TabsContent value="daily" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Daily outlet activity &amp; closing snapshot</CardTitle>
                      <CardDescription>
                        Left: movements classified as sale, issue, or out for the chosen day. Right: central store stock
                        by category (current quantities).
                      </CardDescription>
                    </div>
                    <div className="space-y-1">
                      <Label>Report date</Label>
                      <Input
                        type="date"
                        value={reportDate}
                        onChange={e => setReportDate(e.target.value)}
                        className="w-[200px]"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-8">
                  {loadingDaily ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <div>
                          <h4 className="mb-2 text-sm font-semibold">By outlet / department</h4>
                          <ScrollArea className="h-[min(240px,40vh)] rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Outlet</TableHead>
                                  <TableHead className="text-right">Qty moved</TableHead>
                                  <TableHead className="text-right">Value (est.)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {dailyDeptSummary.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                                      No outs, issues, or sales this day.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  dailyDeptSummary.map(([dept, row]) => (
                                    <TableRow key={dept}>
                                      <TableCell>{dept}</TableCell>
                                      <TableCell className="text-right font-mono">{row.qty.toLocaleString()}</TableCell>
                                      <TableCell className="text-right text-sm">{formatNaira(row.value)}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                        <div>
                          <h4 className="mb-2 text-sm font-semibold">By store category (same movements)</h4>
                          <ScrollArea className="h-[min(240px,40vh)] rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Category</TableHead>
                                  <TableHead className="text-right">Qty moved</TableHead>
                                  <TableHead className="text-right">Value (est.)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {dailyCategorySummary.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                                      No consumption rows for this date.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  dailyCategorySummary.map(([cat, row]) => (
                                    <TableRow key={cat}>
                                      <TableCell>{cat}</TableCell>
                                      <TableCell className="text-right font-mono">{row.qty.toLocaleString()}</TableCell>
                                      <TableCell className="text-right text-sm">{formatNaira(row.value)}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-2 text-sm font-semibold">Central store — closing balance by category</h4>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Live on-hand quantities in the main store (not departmental sub-ledgers).
                        </p>
                        <ScrollArea className="h-[min(280px,45vh)] rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">On hand (qty)</TableHead>
                                <TableHead className="text-right">Stock value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {closingByCategory.map(([cat, row]) => (
                                <TableRow key={cat}>
                                  <TableCell>{cat}</TableCell>
                                  <TableCell className="text-right font-mono">{row.qty.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{formatNaira(row.value)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canAuditTab && (
            <TabsContent value="audit" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Movement audit trail</CardTitle>
                  <CardDescription>
                    Every line includes who recorded the movement and — when captured — who received stock at the
                    outlet.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingAudit ? (
                    <div className="flex justify-center py-16">
                      <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
                    </div>
                  ) : (
                    <ScrollArea className="h-[min(520px,70vh)]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>When</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                            <TableHead className="text-right">Bal</TableHead>
                            <TableHead className="hidden md:table-cell">Dept</TableHead>
                            <TableHead className="hidden lg:table-cell">Received</TableHead>
                            <TableHead className="hidden lg:table-cell">Recorded</TableHead>
                            <TableHead className="hidden xl:table-cell">Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditMovements.map(m => (
                              <TableRow key={m.id}>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                  {format(parseISO(m.created_at), 'MMM d, HH:mm')}
                                </TableCell>
                                <TableCell className="max-w-[140px] truncate text-sm font-medium">
                                  {itemNameById.get(m.item_id) || '—'}
                                </TableCell>
                                <TableCell className="capitalize">{m.movement_type}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {Number(m.quantity) > 0 ? '+' : ''}
                                  {Number(m.quantity).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {m.balance_after != null ? Number(m.balance_after).toLocaleString() : '—'}
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-sm">
                                  {m.destination_department || '—'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-sm">
                                  {m.received_by
                                    ? staffById[m.received_by] || m.received_by.slice(0, 8)
                                    : '—'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-sm">
                                  {m.created_by ? staffById[m.created_by] || m.created_by.slice(0, 8) : '—'}
                                </TableCell>
                                <TableCell className="hidden xl:table-cell max-w-[160px] truncate text-xs text-muted-foreground">
                                  {[m.reference, m.notes].filter(Boolean).join(' · ') || '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                  {!loadingAudit && auditMovements.length === 0 && (
                    <p className="py-12 text-center text-sm text-muted-foreground">No movements yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}

      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription>Used to group items the same way as your monthly store report sections.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Main Bar — Wine"
              />
            </div>
            <div className="space-y-2">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={catForm.sort_order}
                onChange={e => setCatForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCategory()} disabled={catSaving}>
              {catSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit item' : 'New item'}</DialogTitle>
            <DialogDescription>SKU, units, and pricing in Nigerian Naira.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-2 pr-1">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={itemForm.name}
                onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Product name"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>SKU (optional)</Label>
                <Input value={itemForm.sku} onChange={e => setItemForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  value={itemForm.unit}
                  onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="pcs, kg, btts..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={itemForm.category_id || 'none'}
                onValueChange={v => setItemForm(f => ({ ...f, category_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Qty Stock {!editingItem && '(initial)'}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={itemForm.quantity_on_hand}
                  onChange={e => setItemForm(f => ({ ...f, quantity_on_hand: parseFloat(e.target.value) || 0 }))}
                  disabled={!!editingItem}
                />
                {editingItem && (
                  <p className="text-xs text-muted-foreground">Use Adjust stock to change quantity.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Reorder at</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={itemForm.reorder_level}
                  onChange={e => setItemForm(f => ({ ...f, reorder_level: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit price (₦)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={itemForm.unit_price}
                  onChange={e => setItemForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={itemForm.is_active}
                onCheckedChange={v => setItemForm(f => ({ ...f, is_active: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={itemForm.notes}
                onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveItem()} disabled={itemSaving}>
              {itemSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {adjustItem ? (
                <>
                  <span className="font-medium text-foreground">{adjustItem.name}</span> — current on hand:{' '}
                  <span className="font-mono font-semibold">{Number(adjustItem.quantity_on_hand).toLocaleString()}</span>{' '}
                  {adjustItem.unit}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Movement type</Label>
              <Select value={adjustType} onValueChange={v => setAdjustType(v as StoreMovementType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock in (delivery / purchase)</SelectItem>
                  <SelectItem value="out">Stock out (consumption)</SelectItem>
                  {canIssue && (
                    <SelectItem value="issue">Issue to outlet / department (transfer)</SelectItem>
                  )}
                  <SelectItem value="sale">Sale (POS / outlet)</SelectItem>
                  <SelectItem value="adjustment">Physical count (set level)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {adjustType !== 'adjustment' && adjustType !== 'in' && (
              <>
                <div className="space-y-2">
                  <Label>
                    Outlet / department {adjustType === 'issue' ? '(required for issue)' : '(optional)'}
                  </Label>
                  <Select value={adjustDept || '__none__'} onValueChange={v => setAdjustDept(v === '__none__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Not specified —</SelectItem>
                      {OUTLET_DEPARTMENTS.map(d => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Received by (acknowledgement)</Label>
                  <Select
                    value={adjustReceivedBy || '__none__'}
                    onValueChange={v => setAdjustReceivedBy(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional — who took receipt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {Object.entries(staffById)
                        .sort((a, b) => a[1].localeCompare(b[1]))
                        .map(([id, name]) => (
                          <SelectItem key={id} value={id}>
                            {name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {adjustType === 'adjustment' ? (
              <div className="space-y-2">
                <Label>New quantity on hand</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={adjustTarget}
                  onChange={e => setAdjustTarget(e.target.value)}
                  placeholder="Counted total"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  placeholder={adjustType === 'in' ? 'Units received' : 'Units removed / issued'}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Reference (invoice, transfer #)</Label>
              <Input value={adjustRef} onChange={e => setAdjustRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => void applyMovement()} disabled={adjustSaving}>
              {adjustSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteCat} onOpenChange={o => !o && setDeleteCat(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete category?</DialogTitle>
            <DialogDescription>
              Items in &ldquo;{deleteCat?.name}&rdquo; will become uncategorized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCat(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeCategory()} disabled={catSaving}>
              {catSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteItem} onOpenChange={o => !o && setDeleteItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete item permanently?</DialogTitle>
            <DialogDescription>
              This removes &ldquo;{deleteItem?.name}&rdquo; and its movement history for this SKU.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeItem()} disabled={itemSaving}>
              {itemSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
