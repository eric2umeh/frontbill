'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'
import {
  ExpenseEntryFormDialog,
  type ExpenseCategoryOption,
  type ExpenseEntryRecord,
} from '@/components/expenses/expense-entry-form-dialog'
import { usePaginatedList } from '@/lib/hooks/use-paginated-list'
import { TableListControls } from '@/components/shared/table-list-controls'

type PeriodMode = 'month' | 'day' | 'range'

interface Props {
  userId: string
  canAdd: boolean
  canModify: boolean
  canDelete: boolean
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function categoryName(entry: ExpenseEntryRecord): string {
  const cat = entry.expense_categories
  if (!cat) return '—'
  if (Array.isArray(cat)) return cat[0]?.name || '—'
  return cat.name || '—'
}

export function ExpenseLedger({ userId, canAdd, canModify, canDelete }: Props) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [singleDay, setSingleDay] = useState(todayIso)
  const [rangeFrom, setRangeFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [rangeTo, setRangeTo] = useState(todayIso)
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([])
  const [entries, setEntries] = useState<ExpenseEntryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseEntryRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseEntryRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { startDate, endDate, periodLabel } = useMemo(() => {
    if (periodMode === 'day') {
      const d = singleDay || todayIso()
      return {
        startDate: d,
        endDate: d,
        periodLabel: format(parseISO(d), 'EEEE, d MMM yyyy'),
      }
    }
    if (periodMode === 'range') {
      const from = rangeFrom || todayIso()
      const to = rangeTo || from
      const start = from <= to ? from : to
      const end = from <= to ? to : from
      return {
        startDate: start,
        endDate: end,
        periodLabel: `${format(parseISO(start), 'd MMM yyyy')} – ${format(parseISO(end), 'd MMM yyyy')}`,
      }
    }
    return {
      startDate: format(month, 'yyyy-MM-dd'),
      endDate: format(endOfMonth(month), 'yyyy-MM-dd'),
      periodLabel: format(month, 'MMMM yyyy'),
    }
  }, [periodMode, month, singleDay, rangeFrom, rangeTo])

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [catRes, entRes] = await Promise.all([
        fetch(`/api/expenses/categories?caller_id=${userId}`, { credentials: 'include' }),
        fetch(
          `/api/expenses?caller_id=${userId}&start_date=${startDate}&end_date=${endDate}`,
          { credentials: 'include' },
        ),
      ])
      const catJson = await catRes.json()
      const entJson = await entRes.json()
      if (!catRes.ok) throw new Error(catJson.error)
      if (!entRes.ok) throw new Error(entJson.error)
      setCategories(catJson.categories || [])
      setEntries((entJson.entries || []) as ExpenseEntryRecord[])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [userId, startDate, endDate])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (filterCategory !== 'all' && e.category_id !== filterCategory) return false
      if (!q) return true
      const blob = [
        categoryName(e),
        e.description,
        e.reference,
        e.payment_method,
        formatNaira(Number(e.amount)),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [entries, search, filterCategory])

  const monthTotal = useMemo(
    () => filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [filtered],
  )

  const {
    paginatedItems: pageEntries,
    page,
    setPage,
    totalPages,
    totalCount,
    startIndex,
    pageSize,
  } = usePaginatedList<ExpenseEntryRecord>({
    items: filtered,
    pageSize: 12,
  })

  const handleDelete = async () => {
    if (!deleteTarget?.id) return
    setDeleting(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caller_id: userId, delete_id: deleteTarget.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Expense deleted')
      setDeleteTarget(null)
      void load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (entry: ExpenseEntryRecord) => {
    setEditing(entry)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full space-y-3 sm:flex-1">
          <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
            <SelectTrigger className="w-full sm:max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="day">Single day</SelectItem>
              <SelectItem value="range">Date range</SelectItem>
            </SelectContent>
          </Select>

          {periodMode === 'month' && (
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <Button type="button" variant="outline" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[130px] text-center font-semibold">{periodLabel}</span>
              <Button type="button" variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {periodMode === 'day' && (
            <Input
              type="date"
              className="w-full sm:max-w-[220px]"
              value={singleDay}
              onChange={(e) => setSingleDay(e.target.value)}
            />
          )}

          {periodMode === 'range' && (
            <div className="grid grid-cols-2 gap-2 sm:max-w-md">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {canAdd && (
          <Button type="button" className="w-full shrink-0 sm:w-auto" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add expense
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search description, reference, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories
              .filter((c) => c.is_active !== false)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <p className="text-sm text-muted-foreground">
            {filtered.length} line{filtered.length === 1 ? '' : 's'} · {periodLabel}
          </p>
          <p className="text-lg font-bold tabular-nums">{formatNaira(monthTotal)}</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No expenses for this period.
            {canAdd && (
              <>
                {' '}
                Tap <span className="font-medium text-foreground">Add expense</span> to record one.
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <TableListControls
            section="toolbar"
            hideSearch
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            startIndex={startIndex}
            pageSize={pageSize}
            totalCount={totalCount}
          />
          {pageEntries.map((entry) => (
            <Card key={entry.id} className="overflow-hidden">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">{formatNaira(Number(entry.amount))}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{categoryName(entry)}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {format(new Date(entry.expense_date), 'dd MMM')}
                  </Badge>
                </div>

                {entry.description ? <p className="text-sm">{entry.description}</p> : null}

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {entry.payment_method ? (
                    <span className="capitalize">{String(entry.payment_method).replace('_', ' ')}</span>
                  ) : null}
                  {entry.reference ? <span>Ref: {entry.reference}</span> : null}
                  {entry.created_at ? (
                    <span>
                      Recorded {format(new Date(entry.created_at), 'dd MMM · h:mm a')}
                      {entry.created_by_name ? ` · ${entry.created_by_name}` : ''}
                    </span>
                  ) : null}
                  {entry.updated_by_name &&
                  entry.updated_at &&
                  entry.updated_at !== entry.created_at ? (
                    <span>Edited by {entry.updated_by_name}</span>
                  ) : null}
                </div>

                {(canModify || canDelete) && (
                  <div className="flex gap-2 border-t pt-1">
                    {canModify && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(entry)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {totalPages > 1 && (
            <TableListControls
              section="pagination"
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              startIndex={startIndex}
              pageSize={pageSize}
              totalCount={totalCount}
            />
          )}
        </div>
      )}

      <ExpenseEntryFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        userId={userId}
        categories={categories}
        initial={editing}
        onSaved={() => void load()}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${formatNaira(Number(deleteTarget.amount))} · ${categoryName(deleteTarget)}. This cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
