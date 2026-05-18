'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { parseBulkStockLines, resolveBulkItemKey } from '@/lib/store/bulk-stock-parse'
import {
  BULK_ALL_DEPARTMENTS,
  categoriesForOutlet,
  itemMatchesBulkFilters,
} from '@/lib/store/bulk-stock-filters'
import { issueOutletPickerOptions } from '@/lib/store/outlet-departments'
import type { StoreCategoryRow, StoreItemRow } from '@/lib/store/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogScrollableBody,
  DialogScrollableFooter,
  DialogScrollableHeader,
  DialogTitle,
  dialogScrollableContentClass,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Loader2, Search } from 'lucide-react'

type BulkPreviewRow = {
  lineNo: number
  key: string
  qty: number
  item?: StoreItemRow
  error?: string
}

type BulkSelectedLine = { qty: string }

export type BulkStockDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: StoreItemRow[]
  categories: StoreCategoryRow[]
  organizationId: string | null
  userId: string | null
  onApplied: () => void | Promise<void>
}

async function sessionBearerHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  if (!supabase) return {}
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

export function BulkStockDialog({
  open,
  onOpenChange,
  items,
  categories,
  organizationId,
  userId,
  onApplied,
}: BulkStockDialogProps) {
  const [bulkType, setBulkType] = useState<'in' | 'out'>('in')
  const [bulkMovementAt, setBulkMovementAt] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [bulkRef, setBulkRef] = useState('')
  const [bulkNotes, setBulkNotes] = useState('')
  const [bulkDept, setBulkDept] = useState(BULK_ALL_DEPARTMENTS)
  const [bulkCatFilter, setBulkCatFilter] = useState('all')
  const [bulkItemSearch, setBulkItemSearch] = useState('')
  const [bulkSelected, setBulkSelected] = useState<Record<string, BulkSelectedLine>>({})
  const [bulkText, setBulkText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewRow[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)

  const outletOptions = useMemo(() => issueOutletPickerOptions(), [])
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const deptCategories = useMemo(
    () => categoriesForOutlet(categories, bulkDept),
    [categories, bulkDept],
  )

  const matchingCategoryIds = useMemo(
    () => new Set(deptCategories.map((c) => c.id)),
    [deptCategories],
  )

  const pickerItems = useMemo(() => {
    const q = bulkItemSearch.trim().toLowerCase()
    return items
      .filter((it) =>
        itemMatchesBulkFilters(it, {
          department: bulkDept,
          categoryFilter: bulkCatFilter,
          matchingCategoryIds,
          includeInactive: false,
        }),
      )
      .filter((it) => {
        if (!q) return true
        return (
          it.name.toLowerCase().includes(q) ||
          (it.sku || '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items, bulkDept, bulkCatFilter, matchingCategoryIds, bulkItemSearch])

  const selectedCount = Object.keys(bulkSelected).length

  useEffect(() => {
    if (!open) return
    setBulkMovementAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
    setBulkType('in')
    setBulkRef('')
    setBulkNotes('')
    setBulkDept(BULK_ALL_DEPARTMENTS)
    setBulkCatFilter('all')
    setBulkItemSearch('')
    setBulkSelected({})
    setBulkText('')
    setBulkPreview([])
    setShowPaste(false)
  }, [open])

  useEffect(() => {
    if (bulkCatFilter === 'all' || bulkCatFilter === 'none') return
    if (!deptCategories.some((c) => c.id === bulkCatFilter)) {
      setBulkCatFilter('all')
    }
  }, [bulkDept, bulkCatFilter, deptCategories])

  const toggleItem = useCallback((item: StoreItemRow, checked: boolean) => {
    setBulkSelected((prev) => {
      const next = { ...prev }
      if (checked) {
        next[item.id] = { qty: prev[item.id]?.qty ?? '1' }
      } else {
        delete next[item.id]
      }
      return next
    })
    setBulkPreview([])
  }, [])

  const setItemQty = useCallback((itemId: string, qty: string) => {
    setBulkSelected((prev) => {
      if (!prev[itemId]) return prev
      return { ...prev, [itemId]: { qty } }
    })
    setBulkPreview([])
  }, [])

  const buildPreview = useCallback((): BulkPreviewRow[] => {
    const rows: BulkPreviewRow[] = []
    let lineNo = 0

    for (const [itemId, { qty: qtyStr }] of Object.entries(bulkSelected)) {
      const item = itemsById.get(itemId)
      const qty = Number(String(qtyStr).replace(/,/g, '.'))
      lineNo += 1
      const key = item?.sku?.trim() || item?.name || itemId
      if (!item) {
        rows.push({ lineNo, key, qty, error: 'Item not found' })
        continue
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        rows.push({ lineNo, key, qty, item, error: 'Enter a positive quantity' })
        continue
      }
      if (bulkType === 'out' && qty > Number(item.quantity_on_hand)) {
        rows.push({
          lineNo,
          key,
          qty,
          item,
          error: `Only ${Number(item.quantity_on_hand).toLocaleString()} ${item.unit} on hand`,
        })
        continue
      }
      rows.push({ lineNo, key, qty, item })
    }

    const parsed = parseBulkStockLines(bulkText)
    const selectedIds = new Set(Object.keys(bulkSelected))
    for (const p of parsed) {
      lineNo += 1
      const res = resolveBulkItemKey(p.key, items)
      if (!res.ok) {
        rows.push({ ...p, lineNo, error: res.reason })
        continue
      }
      if (selectedIds.has(res.item.id)) {
        rows.push({
          lineNo,
          key: p.key,
          qty: p.qty,
          item: res.item,
          error: 'Already selected above — adjust quantity there',
        })
        continue
      }
      if (bulkType === 'out' && p.qty > Number(res.item.quantity_on_hand)) {
        rows.push({
          lineNo,
          key: p.key,
          qty: p.qty,
          item: res.item,
          error: `Only ${Number(res.item.quantity_on_hand).toLocaleString()} ${res.item.unit} on hand`,
        })
        continue
      }
      rows.push({ lineNo, key: p.key, qty: p.qty, item: res.item })
    }

    return rows
  }, [bulkSelected, bulkText, bulkType, items, itemsById])

  const runBulkPreview = () => {
    const rows = buildPreview()
    if (rows.length === 0) {
      setBulkPreview([])
      toast.error('Select items from the list or paste lines with quantities.')
      return
    }
    setBulkPreview(rows)
    const bad = rows.filter((r) => r.error).length
    if (bad > 0) toast.info(`${rows.length - bad} OK, ${bad} need fixing`)
    else toast.success(`${rows.length} line(s) ready to apply`)
  }

  const applyBulkMovements = async () => {
    if (!organizationId || !userId) return
    const rows = bulkPreview.length > 0 ? bulkPreview : buildPreview()
    const okRows = rows.filter((r) => r.item && !r.error)
    if (okRows.length === 0) {
      toast.error('Preview first and fix any errors.')
      return
    }
    const movementIso = new Date(bulkMovementAt).toISOString()
    if (Number.isNaN(new Date(bulkMovementAt).getTime())) {
      toast.error('Invalid movement date/time')
      return
    }
    setBulkSaving(true)
    try {
      const auth = await sessionBearerHeaders()
      if (!auth.Authorization) {
        toast.error('Session missing — refresh and try again.')
        return
      }
      const res = await fetch('/api/store/bulk-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          caller_id: userId,
          movement_type: bulkType,
          movement_at: movementIso,
          reference: bulkRef.trim(),
          notes: bulkNotes.trim(),
          lines: okRows.map((r) => ({ item_id: r.item!.id, qty: r.qty })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Bulk apply failed')
        return
      }
      toast.success(`Applied ${json.result?.applied ?? okRows.length} movement(s).`)
      onOpenChange(false)
      await onApplied()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Bulk apply failed')
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(dialogScrollableContentClass, 'max-w-2xl')}>
        <DialogScrollableHeader>
          <DialogTitle>Bulk stock in / out</DialogTitle>
          <DialogDescription>
            Filter by department or category, click items to add quantities, then preview. You can still paste lines
            for items not shown in the list.
          </DialogDescription>
        </DialogScrollableHeader>

        <DialogScrollableBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={bulkType} onValueChange={(v) => { setBulkType(v as 'in' | 'out'); setBulkPreview([]) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock in</SelectItem>
                  <SelectItem value="out">Stock out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Movement date &amp; time</Label>
              <Input
                type="datetime-local"
                value={bulkMovementAt}
                onChange={(e) => setBulkMovementAt(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Department / outlet</Label>
              <Select
                value={bulkDept}
                onValueChange={(v) => {
                  setBulkDept(v)
                  setBulkCatFilter('all')
                  setBulkPreview([])
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(280px,50vh)]">
                  <SelectItem value={BULK_ALL_DEPARTMENTS}>All departments</SelectItem>
                  {outletOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Narrows categories (e.g. Main Bar → Main Bar — Wine).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Store category</Label>
              <Select
                value={bulkCatFilter}
                onValueChange={(v) => {
                  setBulkCatFilter(v)
                  setBulkPreview([])
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[min(280px,50vh)]">
                  <SelectItem value="all">All categories{bulkDept !== BULK_ALL_DEPARTMENTS ? ' in department' : ''}</SelectItem>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {deptCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Find items</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name or SKU…"
                value={bulkItemSearch}
                onChange={(e) => setBulkItemSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
              <p className="text-sm font-medium">
                {pickerItems.length} item{pickerItems.length !== 1 ? 's' : ''}
                {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
              </p>
              {selectedCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setBulkSelected({})
                    setBulkPreview([])
                  }}
                >
                  Clear selection
                </Button>
              )}
            </div>
            <ScrollArea className="h-[min(240px,35vh)]">
              {pickerItems.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  No items match these filters. Try another department or category.
                </p>
              ) : (
                <ul className="divide-y">
                  {pickerItems.map((it) => {
                    const selected = Boolean(bulkSelected[it.id])
                    const cat = it.category_id
                      ? categories.find((c) => c.id === it.category_id)
                      : null
                    return (
                      <li key={it.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50',
                            selected && 'bg-amber-50/80 dark:bg-amber-950/20',
                          )}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(c) => toggleItem(it, c === true)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight truncate">{it.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {it.sku ? `${it.sku} · ` : ''}
                              {cat?.name ?? 'Uncategorized'} · On hand{' '}
                              <span className="font-mono tabular-nums">
                                {Number(it.quantity_on_hand).toLocaleString()}
                              </span>{' '}
                              {it.unit}
                            </p>
                          </div>
                          {selected && (
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              className="h-8 w-20 shrink-0 font-mono text-sm"
                              value={bulkSelected[it.id]?.qty ?? '1'}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setItemQty(it.id, e.target.value)}
                            />
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
              onClick={() => setShowPaste((s) => !s)}
            >
              Paste lines instead (optional)
              {showPaste ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showPaste && (
              <Textarea
                value={bulkText}
                onChange={(e) => {
                  setBulkText(e.target.value)
                  setBulkPreview([])
                }}
                rows={5}
                className="font-mono text-sm"
                placeholder={'SKU-100\t24\nTomatoes, 10\nRice 25kg | 2'}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input value={bulkRef} onChange={(e) => setBulkRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} />
            </div>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={runBulkPreview}>
            Preview
          </Button>

          {bulkPreview.length > 0 && (
            <ScrollArea className="h-[min(200px,30vh)] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkPreview.map((row) => (
                    <TableRow key={`${row.lineNo}-${row.key}`}>
                      <TableCell className="text-muted-foreground text-xs">{row.lineNo}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {row.item?.name ?? row.key}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{row.qty}</TableCell>
                      <TableCell className="text-xs">
                        {row.error ? (
                          <span className="text-destructive">{row.error}</span>
                        ) : (
                          <span className="text-green-700">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </DialogScrollableBody>

        <DialogScrollableFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            className="bg-amber-600 hover:bg-amber-700"
            onClick={() => void applyBulkMovements()}
            disabled={bulkSaving}
          >
            {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply all valid lines'}
          </Button>
        </DialogScrollableFooter>
      </DialogContent>
    </Dialog>
  )
}
