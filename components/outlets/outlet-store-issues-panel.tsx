'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { isMainBarIssueDestination } from '@/lib/store/outlet-departments'
import { formatUnitLabel } from '@/lib/supply-chain/measurement-units'
import { hotelCalendarTodayYmd, formatYMDInTimeZone, resolveHotelTimeZone } from '@/lib/hotel-date'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
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

export function OutletStoreIssuesPanel() {
  const { issueOutLog } = useSupplyChain()
  const todayYmd = hotelCalendarTodayYmd()
  const [dateFrom, setDateFrom] = useState(todayYmd)
  const [dateTo, setDateTo] = useState(todayYmd)

  const rows = useMemo(() => {
    return (issueOutLog ?? [])
      .filter((row) => isMainBarIssueDestination(row.destination))
      .filter((row) => {
        const ymd = issuedYmd(row.issuedAt)
        if (!ymd) return true
        if (dateFrom && ymd < dateFrom) return false
        if (dateTo && ymd > dateTo) return false
        return true
      })
  }, [issueOutLog, dateFrom, dateTo])

  return (
    <div className="space-y-3">
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
      </div>

      <PaginatedListShell
        items={rows}
        pageSize={15}
        searchPlaceholder="Search item, received by…"
        searchKeys={['itemName', 'receivedBy', 'issuedBy']}
        emptyMessage="No items issued from Central Store to Main Bar in this date range."
      >
        {(pageRows) => (
          <Card>
            <CardContent className="p-0">
              <div className="md:hidden divide-y">
                {pageRows.map((row, index) => (
                  <div key={`${row.id}-${index}-m`} className="p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{row.itemName}</p>
                      <span className="text-sm tabular-nums shrink-0">
                        {row.quantity} {formatUnitLabel(row.unit)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Received by {row.receivedBy || '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatIssuedDate(row.issuedAt)} · {formatIssuedTime(row.issuedAt)}
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
                      <TableHead>Qty issued</TableHead>
                      <TableHead>Received by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row, index) => (
                      <TableRow key={`${row.id}-${index}`}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatIssuedDate(row.issuedAt)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums whitespace-nowrap">
                          {formatIssuedTime(row.issuedAt)}
                        </TableCell>
                        <TableCell className="font-medium">{row.itemName}</TableCell>
                        <TableCell className="tabular-nums">
                          {row.quantity} {formatUnitLabel(row.unit)}
                        </TableCell>
                        <TableCell>{row.receivedBy || '—'}</TableCell>
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
