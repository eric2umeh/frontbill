'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { formatNaira } from '@/lib/utils/currency'
import { quietBrowserFetch } from '@/lib/utils/fetch-retry'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, History } from 'lucide-react'
import { format } from 'date-fns'

type PriceHistoryEntry = {
  id: string
  field: 'last_price' | 'benchmark_price'
  oldPrice: number
  newPrice: number
  changedByName: string
  createdAt: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
  itemName: string
}

const PAGE_SIZE = 15

function fieldLabel(field: PriceHistoryEntry['field']) {
  return field === 'benchmark_price' ? 'Benchmark' : 'Last price'
}

export function StoreItemPriceHistoryModal({
  open,
  onOpenChange,
  itemId,
  itemName,
}: Props) {
  const { userId } = useAuth()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [field, setField] = useState<'all' | 'last_price' | 'benchmark_price'>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<PriceHistoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const load = useCallback(async () => {
    if (!open || !itemId || !userId || userId === 'placeholder') return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        caller_id: userId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      if (field !== 'all') params.set('field', field)

      const res = await quietBrowserFetch(
        `/api/supply/catalog/${encodeURIComponent(itemId)}/price-history?${params}`,
        { credentials: 'include' },
      )
      if (!res) {
        setError('Could not load price history')
        setEntries([])
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : 'Failed to load')
        setEntries([])
        return
      }
      setEntries(Array.isArray(json.entries) ? json.entries : [])
      setTotal(Number(json.total) || 0)
      setTotalPages(Math.max(1, Number(json.totalPages) || 1))
    } catch {
      setError('Network error')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [open, itemId, userId, page, fromDate, toDate, field])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) {
      setFromDate('')
      setToDate('')
      setField('all')
      setPage(1)
      setEntries([])
      setError(null)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 text-left sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-4 w-4 shrink-0" />
            Price history
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {itemName} — logged whenever last price or benchmark changes.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 space-y-3 border-b px-4 py-3 sm:px-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="mt-0.5 h-9"
                value={fromDate}
                onChange={(e) => {
                  setPage(1)
                  setFromDate(e.target.value)
                }}
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="mt-0.5 h-9"
                value={toDate}
                onChange={(e) => {
                  setPage(1)
                  setToDate(e.target.value)
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Field</Label>
              <Select
                value={field}
                onValueChange={(v) => {
                  setPage(1)
                  setField(v as typeof field)
                }}
              >
                <SelectTrigger className="mt-0.5 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fields</SelectItem>
                  <SelectItem value="last_price">Last price</SelectItem>
                  <SelectItem value="benchmark_price">Benchmark</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                setFromDate('')
                setToDate('')
                setField('all')
                setPage(1)
              }}
            >
              Clear filters
            </Button>
            <span className="text-xs text-muted-foreground">
              {total} change{total === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm text-destructive">{error}</p>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No price changes in this range yet.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium">
                      {fieldLabel(e.field)}:{' '}
                      <span className="text-muted-foreground">
                        {formatNaira(e.oldPrice)}
                      </span>
                      {' → '}
                      <span className="text-foreground">{formatNaira(e.newPrice)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {e.changedByName}
                      {' · '}
                      {e.createdAt
                        ? format(new Date(e.createdAt), 'dd MMM yyyy, HH:mm')
                        : '—'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
