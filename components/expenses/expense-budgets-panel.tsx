'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Save, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { addMonths, subMonths } from 'date-fns'

type Category = { id: string; name: string }

export function ExpenseBudgetsPanel({ userId }: { userId: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [categories, setCategories] = useState<Category[]>([])
  const [limits, setLimits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const year = month.getFullYear()
  const monthNum = month.getMonth() + 1

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [catRes, budRes] = await Promise.all([
        fetch(`/api/expenses/categories?caller_id=${userId}`, { credentials: 'include' }),
        fetch(
          `/api/expenses/budgets?caller_id=${userId}&year=${year}&month=${monthNum}`,
          { credentials: 'include' },
        ),
      ])
      const catJson = await catRes.json()
      const budJson = await budRes.json()
      if (!catRes.ok) throw new Error(catJson.error)
      if (!budRes.ok) throw new Error(budJson.error)

      const cats = (catJson.categories || []).filter((c: { is_active?: boolean }) => c.is_active !== false)
      setCategories(cats.map((c: Category) => ({ id: c.id, name: c.name })))

      const map: Record<string, string> = {}
      for (const c of cats) map[c.id] = ''
      for (const b of budJson.budgets || []) {
        map[b.category_id] = String(b.amount_limit ?? '')
      }
      setLimits(map)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }, [userId, year, monthNum])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const items = Object.entries(limits)
        .filter(([, v]) => Number(v) > 0)
        .map(([category_id, amount_limit]) => ({
          category_id,
          amount_limit: Number(amount_limit),
        }))
      const res = await fetch('/api/expenses/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caller_id: userId,
          year,
          month: monthNum,
          items,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Budgets saved')
    } catch (e: any) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold min-w-[140px] text-center">{format(month, 'MMMM yyyy')}</span>
        <Button type="button" variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" className="ml-auto" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save budgets
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Set monthly limits per category. Reports → Monthly P&amp;L flags categories at 90%+ of budget.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[480px] overflow-y-auto">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 border rounded-md p-2">
            <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
            <Input
              type="number"
              min={0}
              className="h-8 w-28 text-right"
              value={limits[c.id] ?? ''}
              onChange={(e) => setLimits((prev) => ({ ...prev, [c.id]: e.target.value }))}
              placeholder="0"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
