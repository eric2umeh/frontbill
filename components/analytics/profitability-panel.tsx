'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import { formatNaira } from '@/lib/utils/currency'
import type { ProfitabilityAnalysisResult, ProfitabilityAssumptions } from '@/lib/analytics/profitability-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { toast } from 'sonner'
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  Save,
  RefreshCw,
  Calculator,
} from 'lucide-react'

type PeriodKey = 'today' | 'day' | 'range' | '7d' | '30d' | 'this_month'

function toYmd(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export function ProfitabilityPanel() {
  const { userId, role } = useAuth()
  const [period, setPeriod] = useState<PeriodKey>('day')
  const [selectedDay, setSelectedDay] = useState(() => toYmd(new Date()))
  const [rangeStart, setRangeStart] = useState(() => toYmd(new Date()))
  const [rangeEnd, setRangeEnd] = useState(() => toYmd(new Date()))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [analysis, setAnalysis] = useState<ProfitabilityAnalysisResult | null>(null)
  const [assumptions, setAssumptions] = useState<ProfitabilityAssumptions | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ caller_id: userId, period })
      if (period === 'day') {
        qs.set('date', selectedDay)
      } else if (period === 'range') {
        qs.set('start_date', rangeStart)
        qs.set('end_date', rangeEnd || rangeStart)
      }
      const res = await fetch(`/api/analytics/profitability?${qs}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load profitability analysis')
        setAnalysis(null)
        return
      }
      setAnalysis(json.analysis)
      setAssumptions(json.assumptions)
      setCanEdit(Boolean(json.can_edit_assumptions))
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }, [userId, period, selectedDay, rangeStart, rangeEnd])

  useEffect(() => {
    void load()
  }, [load])

  const saveAssumptions = async () => {
    if (!userId || !assumptions) return
    setSaving(true)
    try {
      const res = await fetch('/api/analytics/profitability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caller_id: userId, assumptions }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Save failed')
        return
      }
      toast.success('Assumptions saved')
      void load()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const patchAssumption = (key: keyof ProfitabilityAssumptions, value: number | boolean) => {
    setAssumptions((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  if (loading && !analysis) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const status = analysis?.summary.status
  const StatusIcon =
    status === 'profitable' ? TrendingUp : status === 'loss' ? TrendingDown : Minus
  const statusColor =
    status === 'profitable'
      ? 'text-green-700 bg-green-50 border-green-200'
      : status === 'loss'
        ? 'text-red-700 bg-red-50 border-red-200'
        : 'text-amber-800 bg-amber-50 border-amber-200'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Profitability &amp; unit economics</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Estimate whether the hotel is making or losing money by combining room &amp; outlet revenue
            with operating expenses — including per-room-night costs (diesel, power, breakfast, staff,
            laundry, cleaning).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            value={period}
            onValueChange={(v) => {
              const next = v as PeriodKey
              setPeriod(next)
              if (next === 'day') {
                setSelectedDay(toYmd(new Date()))
              }
              if (next === 'range') {
                const today = toYmd(new Date())
                setRangeStart(today)
                setRangeEnd(today)
              }
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="day">Specific day</SelectItem>
              <SelectItem value="range">Date range</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
            </SelectContent>
          </Select>
          {period === 'day' && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                className="w-40"
                value={selectedDay}
                max={toYmd(new Date())}
                onChange={(e) => setSelectedDay(e.target.value)}
              />
            </div>
          )}
          {period === 'range' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  className="w-40"
                  value={rangeStart}
                  max={rangeEnd || undefined}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  className="w-40"
                  value={rangeEnd}
                  min={rangeStart || undefined}
                  max={toYmd(new Date())}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
            </>
          )}
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {analysis && (
        <>
          <div
            className={`rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3 ${statusColor}`}
          >
            <StatusIcon className="h-5 w-5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold capitalize">
                {status === 'profitable'
                  ? 'Operating profit'
                  : status === 'loss'
                    ? 'Operating loss'
                    : 'Near break-even'}
              </p>
              <p className="text-sm opacity-90">
                GOP {formatNaira(analysis.summary.gross_operating_profit)} ({analysis.summary.net_margin_pct}%
                margin) ·{' '}
                {analysis.period.start === analysis.period.end ? (
                  <>Day {analysis.period.start}</>
                ) : (
                  <>
                    {analysis.period.start} – {analysis.period.end} ({analysis.period.days} days)
                  </>
                )}
              </p>
            </div>
            <div className="text-right text-sm">
              <div>Occupancy {analysis.occupancy.occupancy_pct}%</div>
              <div>ADR {formatNaira(analysis.occupancy.achieved_adr)}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total revenue</p>
                <p className="text-xl font-bold">{formatNaira(analysis.revenue.total)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Rooms {formatNaira(analysis.revenue.accommodation)} · Outlets{' '}
                  {formatNaira(analysis.revenue.outlets)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Operating expenses</p>
                <p className="text-xl font-bold">{formatNaira(analysis.expenses.operating_total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Profit per room night</p>
                <p className="text-xl font-bold">
                  {formatNaira(analysis.unit_economics.profit_per_room_night)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {analysis.unit_economics.margin_pct}% unit margin
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Break-even ADR</p>
                <p className="text-xl font-bold">{formatNaira(analysis.summary.break_even_adr)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {analysis.occupancy.occupied_room_nights} occupied nights
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Per room night breakdown
              </CardTitle>
              <CardDescription>
                Example: revenue rate{' '}
                {formatNaira(analysis.unit_economics.revenue_per_room_night)} minus direct &amp;
                allocated costs — comparable to a daily P&amp;L for one guest room.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between font-semibold border-b pb-2">
                <span>Revenue (rate)</span>
                <span className="text-green-700">
                  +{formatNaira(analysis.unit_economics.revenue_per_room_night)}
                </span>
              </div>
              {analysis.unit_economics.cost_lines.map((line) => (
                <div key={line.key} className="flex justify-between text-sm gap-2">
                  <span className="text-muted-foreground">
                    {line.label}
                    <Badge variant="outline" className="ml-2 text-[10px] py-0">
                      {line.source}
                    </Badge>
                  </span>
                  <span className="tabular-nums shrink-0">−{formatNaira(line.per_room_night)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t pt-2 text-base">
                <span>Net per room night</span>
                <span
                  className={
                    analysis.unit_economics.profit_per_room_night >= 0
                      ? 'text-green-700'
                      : 'text-red-700'
                  }
                >
                  {formatNaira(analysis.unit_economics.profit_per_room_night)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Recommendations
              </CardTitle>
              <CardDescription>
                Guidance on rates, F&amp;B/laundry pricing, marketing, and cost control — based on your
                data and assumptions (not a substitute for audited financial statements).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                {analysis.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {assumptions && (
        <Accordion type="single" collapsible className="rounded-lg border px-4">
          <AccordionItem value="assumptions">
            <AccordionTrigger className="text-sm font-semibold">
              Cost assumptions &amp; methodology
              {!canEdit && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(view only)</span>
              )}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4">
              <div className="text-sm text-muted-foreground space-y-1">
                {analysis?.methodology.map((m, i) => (
                  <p key={i}>• {m}</p>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Total rooms</Label>
                  <Input
                    type="number"
                    min={1}
                    disabled={!canEdit}
                    value={assumptions.total_rooms}
                    onChange={(e) => patchAssumption('total_rooms', Number(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sample room rate (₦/night)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={assumptions.sample_room_rate}
                    onChange={(e) => patchAssumption('sample_room_rate', Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Breakfast cost / guest (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={assumptions.breakfast_cost_per_guest}
                    onChange={(e) =>
                      patchAssumption('breakfast_cost_per_guest', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Diesel (₦/week)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={assumptions.diesel_weekly_amount}
                    onChange={(e) =>
                      patchAssumption('diesel_weekly_amount', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Electricity (₦/month)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={assumptions.electricity_monthly_amount}
                    onChange={(e) =>
                      patchAssumption('electricity_monthly_amount', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Laundry (₦/room night)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={assumptions.laundry_cost_per_room_night}
                    onChange={(e) =>
                      patchAssumption('laundry_cost_per_room_night', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cleaning (₦/room night)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={assumptions.cleaning_supplies_per_room_night}
                    onChange={(e) =>
                      patchAssumption('cleaning_supplies_per_room_night', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Staff payroll (₦/month)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={assumptions.staff_salary_monthly}
                    onChange={(e) =>
                      patchAssumption('staff_salary_monthly', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Rooms share of payroll (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canEdit}
                    value={assumptions.staff_allocation_to_rooms_pct}
                    onChange={(e) =>
                      patchAssumption('staff_allocation_to_rooms_pct', Number(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="use-sample-rate"
                  disabled={!canEdit}
                  checked={assumptions.use_sample_rate_for_unit_model}
                  onCheckedChange={(c) =>
                    patchAssumption('use_sample_rate_for_unit_model', Boolean(c))
                  }
                />
                <Label htmlFor="use-sample-rate" className="font-normal text-sm cursor-pointer">
                  Use sample room rate for unit model (otherwise use achieved ADR from bookings)
                </Label>
              </div>
              {canEdit && (
                <Button onClick={() => void saveAssumptions()} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save assumptions
                </Button>
              )}
              {['superadmin', 'admin', 'manager'].includes(String(role || '')) === false && (
                <p className="text-xs text-muted-foreground">
                  Only Superadmin, Administrator, and Manager can edit assumptions.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
