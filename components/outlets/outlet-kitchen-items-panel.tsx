'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  downloadKitchenToRestaurantReport,
  kitchenToRestaurantRows,
} from '@/lib/outlets/kitchen-to-restaurant-report'
import { hotelCalendarTodayYmd, formatYMDInTimeZone, resolveHotelTimeZone } from '@/lib/hotel-date'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function issuedYmd(iso: string): string {
  try {
    return formatYMDInTimeZone(new Date(iso), resolveHotelTimeZone())
  } catch {
    return ''
  }
}

function formatIssuedDate(iso: string): string {
  try {
    return format(new Date(iso), 'dd MMM yyyy')
  } catch {
    return '—'
  }
}

function formatIssuedTime(iso: string): string {
  try {
    return format(new Date(iso), 'HH:mm')
  } catch {
    return '—'
  }
}

export function OutletKitchenItemsPanel() {
  const { batches, recipes } = useSupplyChain()
  const todayYmd = hotelCalendarTodayYmd()
  const [dateFrom, setDateFrom] = useState(todayYmd)
  const [dateTo, setDateTo] = useState(todayYmd)

  const rows = useMemo(() => {
    return kitchenToRestaurantRows(batches, recipes).filter((row) => {
      const ymd = issuedYmd(row.at)
      if (!ymd) return true
      if (dateFrom && ymd < dateFrom) return false
      if (dateTo && ymd > dateTo) return false
      return true
    })
  }, [batches, recipes, dateFrom, dateTo])

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Closed kitchen production that went to Restaurant (menu listing and sellable portions).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="h-8 w-[132px] text-xs"
          title="From date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          type="date"
          className="h-8 w-[132px] text-xs"
          title="To date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
        {dateFrom && dateTo ? (
          <span className="text-xs text-muted-foreground">
            {dateFrom === dateTo
              ? format(parseISO(dateFrom), 'dd MMM yyyy')
              : `${format(parseISO(dateFrom), 'dd MMM yyyy')} – ${format(parseISO(dateTo), 'dd MMM yyyy')}`}
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 ml-auto"
          disabled={rows.length === 0}
          onClick={() => {
            downloadKitchenToRestaurantReport(rows, { dateFrom, dateTo })
            toast.success(`Downloaded ${rows.length} kitchen item(s) to Restaurant`)
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Download report
        </Button>
      </div>

      <PaginatedListShell
        items={rows}
        pageSize={15}
        searchPlaceholder="Search dish, category, chef…"
        searchKeys={['itemName', 'category', 'producedBy']}
        emptyMessage="No kitchen production sent to Restaurant in this date range."
      >
        {(pageRows) => (
          <Card>
            <CardContent className="p-0">
              <div className="md:hidden divide-y">
                {pageRows.map((row) => (
                  <div key={`${row.id}-m`} className="p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{row.itemName}</p>
                      <span className="text-sm tabular-nums shrink-0">
                        {row.sellableToRestaurant} {row.unit}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.category || '—'} · {row.producedBy || '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatIssuedDate(row.at)} · {formatIssuedTime(row.at)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Sellable</TableHead>
                      <TableHead>Produced by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatIssuedDate(row.at)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums whitespace-nowrap">
                          {formatIssuedTime(row.at)}
                        </TableCell>
                        <TableCell className="font-medium">{row.itemName}</TableCell>
                        <TableCell>{row.category || '—'}</TableCell>
                        <TableCell className="tabular-nums">
                          {row.sellableToRestaurant} {row.unit}
                        </TableCell>
                        <TableCell>{row.producedBy || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </PaginatedListShell>
    </div>
  )
}
