'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { RefreshCw, Search, Bed, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LoadingSpinner } from '@/components/loading-screen'
import { HousekeepingStatusBadge } from '@/components/rooms/housekeeping-status-badge'
import type { HousekeepingFloorReport } from '@/lib/reports/housekeeping-floor-report'
import { toast } from 'sonner'

export function HousekeepingFloorReportPanel() {
  const [report, setReport] = useState<HousekeepingFloorReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/housekeeping-floor', {
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not load report')
      setReport(json.report as HousekeepingFloorReport)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not load report')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const q = search.trim().toLowerCase()

  const filteredRooms = useMemo(() => {
    if (!report) return []
    if (!q) return report.rooms
    return report.rooms.filter((r) => {
      const hay = [
        r.room_number,
        r.room_type,
        r.housekeeping_status_label,
        r.guest_name,
        r.pms_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [report, q])

  const filteredReservations = useMemo(() => {
    if (!report) return []
    if (!q) return report.future_reservations
    return report.future_reservations.filter((r) => {
      const hay = [r.guest_name, r.room_number, r.room_type, r.folio_id, r.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [report, q])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-muted-foreground">Loading front desk report…</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <p className="text-sm">Report unavailable.</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Room floor status and upcoming reservations from front desk — no rates or
            payment amounts.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            As of {format(parseISO(`${report.as_of_date}T12:00:00`), 'EEE d MMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search room or guest…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bed className="h-4 w-4" />
            Room status ({filteredRooms.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>HK status</TableHead>
                  <TableHead>PMS</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Stay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRooms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No rooms match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRooms.map((r) => (
                      <TableRow key={r.room_id}>
                        <TableCell className="font-medium">{r.room_number}</TableCell>
                        <TableCell className="text-muted-foreground">{r.room_type}</TableCell>
                        <TableCell>
                          {r.housekeeping_status ? (
                            <HousekeepingStatusBadge
                              status={r.housekeeping_status}
                              variant="both"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Not set</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {r.pms_status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.guest_name || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.stay_check_in && r.stay_check_out
                            ? `${r.stay_check_in} → ${r.stay_check_out}`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Future reservations ({filteredReservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arrival</TableHead>
                  <TableHead>Departure</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReservations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No upcoming reservations.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReservations.map((r) => (
                    <TableRow key={r.booking_id}>
                      <TableCell>{r.check_in}</TableCell>
                      <TableCell>{r.check_out}</TableCell>
                      <TableCell className="font-medium">{r.room_number}</TableCell>
                      <TableCell className="text-muted-foreground">{r.room_type}</TableCell>
                      <TableCell>{r.guest_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {r.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
