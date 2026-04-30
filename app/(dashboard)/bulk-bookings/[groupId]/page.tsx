'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNaira } from '@/lib/utils/currency'
import { getBulkGroupId, isLegacyBulkGroupId } from '@/lib/utils/bulk-booking'

export default function BulkBookingDetailPage({ params }: { params: Promise<{ groupId: string }> | { groupId: string } }) {
  const router = useRouter()
  const { organizationId } = useAuth()
  const [groupId, setGroupId] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const resolved = await Promise.resolve(params)
      setGroupId(resolved.groupId)
      await fetchBulkRows(resolved.groupId)
    }
    init()
  }, [])

  const fetchBulkRows = async (id: string) => {
    try {
      setLoading(true)
      const supabase = createClient()
      const query = supabase
        .from('bookings')
        .select('*, guests:guest_id(name, phone), rooms:room_id(room_number, room_type)')
        .eq('organization_id', organizationId)
        .order('room_id', { ascending: true })
      
      const { data, error } = isLegacyBulkGroupId(id)
        ? await query.ilike('folio_id', 'BLK-%')
        : await query.ilike('notes', `%bulk_group:${id}%`)

      if (error) throw error
      setRows(isLegacyBulkGroupId(id)
        ? (data || []).filter((row: any) => getBulkGroupId(row) === id)
        : data || []
      )
    } finally {
      setLoading(false)
    }
  }

  const first = rows[0]
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
  const totalDeposit = rows.reduce((sum, row) => sum + Number(row.deposit || 0), 0)
  const totalBalance = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0)
  const ledgerName = first?.notes?.match(/City Ledger:\s*([^|]+)/i)?.[1]?.trim()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bulk Booking Details</h1>
        <p className="text-muted-foreground">Group reference: {groupId}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Rooms</CardDescription>
            <CardTitle>{rows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Amount</CardDescription>
            <CardTitle>{formatNaira(totalAmount)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Amount Paid</CardDescription>
            <CardTitle>{formatNaira(totalDeposit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding</CardDescription>
            <CardTitle>{formatNaira(totalBalance)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {ledgerName && (
        <Card>
          <CardContent className="p-4 text-sm">
            City Ledger Account: <span className="font-semibold">{ledgerName}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rooms and Guests</CardTitle>
          <CardDescription>All rooms created under this bulk booking/reservation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No records found for this bulk group.
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(row.status === 'reserved' ? `/reservations/${row.id}` : `/bookings/${row.id}`)}>
                  <TableCell className="font-mono text-xs">{row.folio_id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.guests?.name || 'Unassigned'}</div>
                    <div className="text-xs text-muted-foreground">{row.guests?.phone}</div>
                  </TableCell>
                  <TableCell>
                    {row.rooms?.room_number ? `Room ${row.rooms.room_number}` : 'Unassigned'}
                    <div className="text-xs text-muted-foreground">{row.rooms?.room_type}</div>
                  </TableCell>
                  <TableCell className="text-sm">{row.check_in} to {row.check_out}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatNaira(row.total_amount || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
