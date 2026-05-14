'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { formatNaira } from '@/lib/utils/currency'
import {
  aggregateMonthlyMovements,
  buildMonthlyReportSections,
  reportMonthLabel,
  type MonthlyReportSection,
} from '@/lib/store/monthly-report'
import type { StoreCategoryRow, StoreItemRow, MovementRow } from '@/lib/store/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { format, endOfMonth, parseISO, startOfMonth } from 'date-fns'
import { Download, FileSpreadsheet, Loader2, Printer } from 'lucide-react'

function defaultMonthYm() {
  const d = new Date()
  return format(d, 'yyyy-MM')
}

export function MonthlyStoreReport() {
  const { organizationId } = useAuth()
  const [monthYm, setMonthYm] = useState(defaultMonthYm)
  const [hotelName, setHotelName] = useState('')
  const [categories, setCategories] = useState<StoreCategoryRow[]>([])
  const [items, setItems] = useState<StoreItemRow[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string>('')

  const fetchReportData = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId) return
    setLoading(true)
    try {
      const start = startOfMonth(parseISO(`${monthYm}-01`))
      const end = endOfMonth(start)
      const startIso = start.toISOString()
      const endIso = end.toISOString()

      const [{ data: orgRow }, { data: cats, error: e1 }, { data: its, error: e2 }] = await Promise.all([
        supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
        supabase
          .from('store_categories')
          .select('*')
          .eq('organization_id', organizationId)
          .order('sort_order', { ascending: true }),
        supabase.from('store_items').select('*').eq('organization_id', organizationId),
      ])

      if (e1) throw e1
      if (e2) throw e2

      const pageSize = 1000
      const movesAgg: MovementRow[] = []
      for (let offset = 0; ; offset += pageSize) {
        const { data: page, error: e3 } = await supabase
          .from('store_stock_movements')
          .select('*')
          .eq('organization_id', organizationId)
          .gte('movement_at', startIso)
          .lte('movement_at', endIso)
          .order('movement_at', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (e3) throw e3
        const chunk = (page || []) as MovementRow[]
        movesAgg.push(...chunk)
        if (chunk.length < pageSize) break
      }

      setHotelName((orgRow as { name?: string } | null)?.name || 'Hotel')
      setCategories((cats || []) as StoreCategoryRow[])
      setItems((its || []) as StoreItemRow[])
      setMovements(movesAgg)
      setGeneratedAt(new Date().toISOString())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load monthly report')
      setCategories([])
      setItems([])
      setMovements([])
    } finally {
      setLoading(false)
    }
  }, [organizationId, monthYm])

  useEffect(() => {
    void fetchReportData()
  }, [fetchReportData])

  const unitPriceMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.id, Number(it.unit_price || 0))
    return m
  }, [items])

  const agg = useMemo(
    () => aggregateMonthlyMovements(movements, unitPriceMap),
    [movements, unitPriceMap],
  )

  const sections = useMemo(
    () => buildMonthlyReportSections(categories, items, agg),
    [categories, items, agg],
  )

  const totals = useMemo(() => {
    let stock = 0
    let monthOut = 0
    let lines = 0
    for (const s of sections) {
      stock += s.subtotalStockValue
      monthOut += s.subtotalMonthOutValue
      lines += s.lines.length
    }
    return { stock, monthOut, lines, sections: sections.length }
  }, [sections])

  const printReport = () => {
    window.print()
  }

  const downloadCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? '')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const rows: string[] = []
    rows.push(
      [
        'Section',
        'Line',
        'Item',
        'Unit',
        'Qty on hand',
        'Unit price',
        'Stock value',
        'Month qty in',
        'Month qty out',
        'Month out value (est.)',
        'Remark',
      ].join(','),
    )
    for (const sec of sections) {
      rows.push([esc(sec.title), '', '', '', '', '', '', '', '', '', ''].join(','))
      let n = 0
      for (const line of sec.lines) {
        n += 1
        const it = line.item
        rows.push(
          [
            esc(sec.title),
            n,
            esc(it.name),
            esc(it.unit),
            line.qtyOnHand,
            line.unitPrice,
            line.stockValue.toFixed(2),
            line.monthQtyIn,
            line.monthQtyOut,
            line.monthValueOut.toFixed(2),
            esc((it.notes || '').replace(/\n/g, ' ')),
          ].join(','),
        )
      }
      rows.push(
        [
          esc(`${sec.title} — subtotal`),
          '',
          '',
            '',
            '',
            '',
            sec.subtotalStockValue.toFixed(2),
            '',
            '',
            sec.subtotalMonthOutValue.toFixed(2),
            '',
          ].join(','),
      )
    }
    rows.push(
      [
        'GRAND TOTAL',
        '',
        '',
        '',
        '',
        '',
        totals.stock.toFixed(2),
        '',
        '',
        totals.monthOut.toFixed(2),
        '',
      ].join(','),
    )

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `store-monthly-report-${monthYm}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly report</CardTitle>
          <CardDescription>Organization required.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <Card className="border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/20 print:hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg">Monthly store report</CardTitle>
              <CardDescription>
                For management &amp; accounts: closing stock by category, unit pricing, and estimated consumption for the
                selected month (from stock movements).
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="report-month">Report month</Label>
                <Input
                  id="report-month"
                  type="month"
                  value={monthYm}
                  onChange={e => setMonthYm(e.target.value)}
                  className="w-[200px]"
                />
              </div>
              <Button type="button" variant="secondary" onClick={() => void fetchReportData()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                <span className="ml-2">Refresh</span>
              </Button>
              <Button type="button" variant="outline" onClick={printReport}>
                <Printer className="h-4 w-4" />
                <span className="ml-2">Print</span>
              </Button>
              <Button type="button" className="bg-amber-600 hover:bg-amber-700" onClick={downloadCsv} disabled={sections.length === 0}>
                <Download className="h-4 w-4" />
                <span className="ml-2">Download CSV</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card id="store-monthly-report-print" className="print:border-0 print:shadow-none">
        <CardContent className="p-4 md:p-6">
          <div className="mb-6 border-b pb-4 text-center print:mb-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">General store</p>
            <h2 className="text-xl font-bold md:text-2xl">{hotelName}</h2>
            <p className="mt-1 text-lg font-semibold">Monthly report — {reportMonthLabel(monthYm)}</p>
            {generatedAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                Generated {format(parseISO(generatedAt), 'dd MMM yyyy, HH:mm')} · On-hand figures are the live central
                store snapshot; month columns use movements recorded in FrontBill for that month.
              </p>
            )}
          </div>

          <div className="mb-4 flex flex-wrap gap-4 text-sm print:hidden">
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">Report lines: </span>
              <strong>{totals.lines}</strong>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">Total stock value: </span>
              <strong>{formatNaira(totals.stock)}</strong>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">Month issues / outs (est. ₦): </span>
              <strong>{formatNaira(totals.monthOut)}</strong>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
            </div>
          ) : sections.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No categorized stock items to show. Add categories and items under Inventory, then refresh.
            </p>
          ) : (
            <div className="space-y-10 print:space-y-6">
              {sections.map((sec) => (
                <MonthlyReportSectionBlock key={sec.title} section={sec} />
              ))}
              <div className="overflow-x-auto rounded-lg border-2 border-amber-800/30 bg-amber-50/50 p-4 dark:bg-amber-950/30 print:border print:bg-white">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold text-lg">Grand total — all sections</span>
                  <div className="flex flex-wrap gap-6 text-sm">
                    <span>
                      <span className="text-muted-foreground">Closing stock value: </span>
                      <strong className="tabular-nums">{formatNaira(totals.stock)}</strong>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Month issues / outs (est.): </span>
                      <strong className="tabular-nums">{formatNaira(totals.monthOut)}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MonthlyReportSectionBlock({ section }: { section: MonthlyReportSection }) {
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 border-b-2 border-amber-600/50 pb-1 text-base font-bold uppercase tracking-tight text-amber-900 dark:text-amber-200 print:text-black">
        {section.title}
      </h3>
      <ScrollArea className="max-h-[min(70vh,900px)] rounded-md border md:max-h-none print:max-h-none print:overflow-visible">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-10">#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="w-16">Unit</TableHead>
              <TableHead className="text-right">Qty on hand</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Unit ₦</TableHead>
              <TableHead className="text-right">Stock value</TableHead>
              <TableHead className="hidden text-right lg:table-cell">In (mo.)</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Out (mo.)</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Out ₦ (est.)</TableHead>
              <TableHead className="hidden max-w-[120px] md:table-cell">Remark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {section.lines.map((line, idx) => (
              <TableRow key={line.item.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="max-w-[200px]">
                  <div className="font-medium leading-tight">{line.item.name}</div>
                  {line.item.sku && (
                    <div className="text-[10px] text-muted-foreground font-mono">{line.item.sku}</div>
                  )}
                </TableCell>
                <TableCell className="text-xs capitalize">{line.item.unit}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {line.qtyOnHand.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                </TableCell>
                <TableCell className="hidden text-right text-sm sm:table-cell">{formatNaira(line.unitPrice)}</TableCell>
                <TableCell className="text-right text-sm font-medium">{formatNaira(line.stockValue)}</TableCell>
                <TableCell className="hidden text-right font-mono text-sm lg:table-cell">
                  {line.monthQtyIn > 0 ? line.monthQtyIn.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'}
                </TableCell>
                <TableCell className="hidden text-right font-mono text-sm lg:table-cell">
                  {line.monthQtyOut > 0 ? line.monthQtyOut.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'}
                </TableCell>
                <TableCell className="hidden text-right text-sm xl:table-cell">
                  {line.monthValueOut > 0 ? formatNaira(line.monthValueOut) : '—'}
                </TableCell>
                <TableCell className="hidden max-w-[140px] truncate text-xs text-muted-foreground md:table-cell">
                  {line.item.notes || '—'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-amber-50/80 font-semibold dark:bg-amber-950/40">
              <TableCell colSpan={5} className="text-right">
                Section subtotal
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNaira(section.subtotalStockValue)}</TableCell>
              <TableCell className="hidden lg:table-cell" />
              <TableCell className="hidden lg:table-cell" />
              <TableCell className="hidden text-right tabular-nums xl:table-cell">
                {formatNaira(section.subtotalMonthOutValue)}
              </TableCell>
              <TableCell className="hidden md:table-cell" />
            </TableRow>
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
