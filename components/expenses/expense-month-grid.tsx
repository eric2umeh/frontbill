'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'

type Category = { id: string; name: string; code: string; sort_order: number }

type DayState = {
  description: string
  cells: Record<string, string>
}

interface Props {
  userId: string
  canEdit: boolean
}

export function ExpenseMonthGrid({ userId, canEdit }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [categories, setCategories] = useState<Category[]>([])
  const [days, setDays] = useState<Record<string, DayState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const monthStart = format(month, 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd')
  const dayList = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }),
    [month],
  )

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [catRes, dataRes] = await Promise.all([
        fetch(`/api/expenses/categories?caller_id=${userId}`, { credentials: 'include' }),
        fetch(
          `/api/expenses?caller_id=${userId}&start_date=${monthStart}&end_date=${monthEnd}`,
          { credentials: 'include' },
        ),
      ])
      const catJson = await catRes.json()
      const dataJson = await dataRes.json()
      if (!catRes.ok) throw new Error(catJson.error || 'Failed to load categories')
      if (!dataRes.ok) throw new Error(dataJson.error || 'Failed to load expenses')

      const cats = (catJson.categories || []).filter((c: Category & { is_active?: boolean }) =>
        c.is_active !== false,
      ) as Category[]
      setCategories(cats)

      const noteMap = new Map(
        (dataJson.day_notes || []).map((n: { expense_date: string; description: string }) => [
          n.expense_date,
          n.description || '',
        ]),
      )

      const next: Record<string, DayState> = {}
      for (const d of dayList) {
        const key = format(d, 'yyyy-MM-dd')
        next[key] = { description: noteMap.get(key) || '', cells: {} }
        for (const c of cats) next[key].cells[c.id] = ''
      }

      for (const e of dataJson.entries || []) {
        const key = String(e.expense_date).slice(0, 10)
        if (!next[key]) continue
        next[key].cells[e.category_id] = String(e.amount ?? '')
      }
      setDays(next)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load')
      setDays({})
    } finally {
      setLoading(false)
    }
  }, [userId, monthStart, monthEnd, dayList])

  useEffect(() => {
    void load()
  }, [load])

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const c of categories) totals[c.id] = 0
    for (const d of Object.values(days)) {
      for (const [cid, raw] of Object.entries(d.cells)) {
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0) totals[cid] = (totals[cid] || 0) + n
      }
    }
    return totals
  }, [days, categories])

  const grandTotal = useMemo(
    () => Object.values(categoryTotals).reduce((s, v) => s + v, 0),
    [categoryTotals],
  )

  const setCell = (dateKey: string, categoryId: string, value: string) => {
    setDays((prev) => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        cells: { ...prev[dateKey]?.cells, [categoryId]: value },
      },
    }))
  }

  const setDescription = (dateKey: string, value: string) => {
    setDays((prev) => ({
      ...prev,
      [dateKey]: { ...prev[dateKey], description: value },
    }))
  }

  const saveMonth = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      const payload = {
        caller_id: userId,
        bulk: {
          days: Object.entries(days).map(([date, st]) => ({
            date,
            description: st.description,
            cells: Object.fromEntries(
              Object.entries(st.cells).map(([cid, v]) => {
                const trimmed = String(v ?? '').trim()
                return [cid, trimmed === '' ? 0 : Number(trimmed)]
              }),
            ),
          })),
        },
      }
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      toast.success('Expenditure saved')
      void load()
    } catch (e: any) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button type="button" variant="outline" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[140px] text-center font-semibold">{format(month, 'MMMM yyyy')}</span>
        <Button type="button" variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {canEdit && (
          <Button type="button" onClick={() => void saveMonth()} disabled={saving} className="ml-auto">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save month
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground print:hidden">
        Month total: <span className="font-semibold text-foreground">{formatNaira(grandTotal)}</span>
      </div>

      <div className="border rounded-lg overflow-auto max-h-[min(70vh,720px)]">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="text-left p-2 border-b sticky left-0 bg-muted z-20 min-w-[88px]">Date</th>
              <th className="text-left p-2 border-b min-w-[120px]">Description</th>
              {categories.map((c) => (
                <th key={c.id} className="text-right p-2 border-b min-w-[72px] whitespace-nowrap">
                  {c.name}
                </th>
              ))}
              <th className="text-right p-2 border-b min-w-[80px]">Day total</th>
            </tr>
          </thead>
          <tbody>
            {dayList.map((d) => {
              const key = format(d, 'yyyy-MM-dd')
              const st = days[key] || { description: '', cells: {} }
              let dayTotal = 0
              for (const c of categories) {
                const n = Number(st.cells[c.id])
                if (Number.isFinite(n) && n > 0) dayTotal += n
              }
              return (
                <tr key={key} className="border-t hover:bg-muted/30">
                  <td className="p-1.5 sticky left-0 bg-background border-r font-medium whitespace-nowrap">
                    {format(d, 'd MMM')}
                  </td>
                  <td className="p-1">
                    <Input
                      className="h-7 text-xs"
                      value={st.description}
                      disabled={!canEdit}
                      onChange={(e) => setDescription(key, e.target.value)}
                      placeholder="—"
                    />
                  </td>
                  {categories.map((c) => (
                    <td key={c.id} className="p-1">
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-xs text-right"
                        value={st.cells[c.id] ?? ''}
                        disabled={!canEdit}
                        onChange={(e) => setCell(key, c.id, e.target.value)}
                        placeholder=""
                      />
                    </td>
                  ))}
                  <td className="p-2 text-right font-medium tabular-nums">{formatNaira(dayTotal)}</td>
                </tr>
              )
            })}
            <tr className="bg-muted/60 font-semibold border-t-2">
              <td className="p-2 sticky left-0 bg-muted/60" colSpan={2}>
                TOTAL
              </td>
              {categories.map((c) => (
                <td key={c.id} className="p-2 text-right tabular-nums">
                  {formatNaira(categoryTotals[c.id] || 0)}
                </td>
              ))}
              <td className="p-2 text-right tabular-nums">{formatNaira(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
