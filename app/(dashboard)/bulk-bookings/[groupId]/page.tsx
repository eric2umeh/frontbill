'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNaira } from '@/lib/utils/currency'
import { getBulkGroupId, isLegacyBulkGroupId } from '@/lib/utils/bulk-booking'
import { manualCheckoutEligible, resolvedCheckoutDateForClosing, DEFAULT_ORG_CHECKOUT_TIME } from '@/lib/utils/booking-checkout-ui'
import { CheckoutConfirmDialog } from '@/components/bookings/checkout-confirm-dialog'
import { toast } from 'sonner'

type BulkPageCheckoutDraft = { kind: 'row'; row: any } | { kind: 'all'; targets: any[] }

export default function BulkBookingDetailPage({ params }: { params: Promise<{ groupId: string }> | { groupId: string } }) {
  const router = useRouter()
  const { organizationId, userId, role } = useAuth()
  const canManageFolio = role === 'superadmin' || role === 'admin' || role === 'front_desk'
  const [groupId, setGroupId] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutRowId, setCheckoutRowId] = useState<string | null>(null)
  const [checkoutAllLoading, setCheckoutAllLoading] = useState(false)
  const [checkoutDraft, setCheckoutDraft] = useState<BulkPageCheckoutDraft | null>(null)
  const [orgCheckoutTime, setOrgCheckoutTime] = useState(DEFAULT_ORG_CHECKOUT_TIME)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      if (!supabase) return
      const { data } = await supabase
        .from('organizations')
        .select('checkout_time')
        .eq('id', organizationId)
        .maybeSingle()
      if (!cancelled) setOrgCheckoutTime(data?.checkout_time ?? DEFAULT_ORG_CHECKOUT_TIME)
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

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

  const runCheckoutUpdates = async (
    targets: Array<{ id: string; room_id: string | null; check_out: string }>,
  ) => {
    const supabase = createClient()
    if (!supabase) throw new Error('Unable to connect')
    for (const row of targets) {
      const outDate = resolvedCheckoutDateForClosing(row)
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'checked_out',
          check_out: outDate,
          folio_status: 'checked_out',
          updated_by: userId,
        })
        .eq('id', row.id)
      if (error) throw error
      if (row.room_id) {
        await supabase.from('rooms').update({ status: 'available' }).eq('id', row.room_id)
      }
    }
  }

  const checkoutRowEligible = (r: any) =>
    manualCheckoutEligible(
      {
        status: r.status,
        check_in: r.check_in,
        check_out: r.check_out,
        folio_status: r.folio_status,
      },
      orgCheckoutTime,
    )

  const checkoutDialogBusy =
    checkoutDraft?.kind === 'row'
      ? checkoutRowId === checkoutDraft.row.id
      : checkoutDraft?.kind === 'all'
        ? checkoutAllLoading
        : false

  const handleCheckoutOneRow = (row: any) => {
    if (!checkoutRowEligible(row)) return
    setCheckoutDraft({ kind: 'row', row })
  }

  const handleCheckoutAllEligible = () => {
    const targets = rows.filter((r) => checkoutRowEligible(r))
    if (targets.length === 0) {
      toast.message('No folios are available for checkout.')
      return
    }
    setCheckoutDraft({ kind: 'all', targets })
  }

  const confirmBulkCheckoutFromDialog = async () => {
    if (!checkoutDraft || !userId) return

    if (checkoutDraft.kind === 'row') {
      const row = checkoutDraft.row
      setCheckoutRowId(row.id)
      try {
        await runCheckoutUpdates([row])
        toast.success(`${row.guests?.name || 'Guest'} checked out successfully`)
        setCheckoutDraft(null)
        await fetchBulkRows(groupId)
      } catch (err: any) {
        toast.error(err.message || 'Failed to check out guest')
      } finally {
        setCheckoutRowId(null)
      }
      return
    }

    const targets = checkoutDraft.targets
    setCheckoutAllLoading(true)
    try {
      await runCheckoutUpdates(targets)
      toast.success(`Checked out ${targets.length} room${targets.length === 1 ? '' : 's'}`)
      setCheckoutDraft(null)
      await fetchBulkRows(groupId)
    } catch (err: any) {
      toast.error(err.message || 'Failed to check out group')
    } finally {
      setCheckoutAllLoading(false)
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
      <CheckoutConfirmDialog
        open={checkoutDraft !== null}
        onClose={() => {
          if (checkoutDialogBusy) return
          setCheckoutDraft(null)
        }}
        title={
          checkoutDraft?.kind === 'all'
            ? `Check out ${checkoutDraft.targets.length} room${checkoutDraft.targets.length === 1 ? '' : 's'}?`
            : 'Check out guest?'
        }
        description={
          checkoutDraft?.kind === 'all' ? (
            <>
              <p>All eligible folios in this bulk group will be marked checked out.</p>
            </>
          ) : checkoutDraft?.kind === 'row' ? (
            <>
              <p>
                <span className="font-medium text-foreground">{checkoutDraft.row.guests?.name || 'Guest'}</span>
                {' — '}
                {checkoutDraft.row.rooms?.room_number
                  ? `Room ${checkoutDraft.row.rooms.room_number}`
                  : 'Unassigned'}
              </p>
              <p className="mt-1">This closes the folio and frees the room.</p>
            </>
          ) : undefined
        }
        outstandingAmount={
          checkoutDraft?.kind === 'all'
            ? checkoutDraft.targets.reduce((s, r) => s + Number(r.balance ?? 0), 0)
            : checkoutDraft?.kind === 'row'
              ? Number(checkoutDraft.row.balance ?? 0)
              : undefined
        }
        outstandingLabel={checkoutDraft?.kind === 'all' ? 'Outstanding (sum):' : 'Outstanding balance:'}
        loading={checkoutDialogBusy}
        onConfirm={confirmBulkCheckoutFromDialog}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {canManageFolio && rows.some((r) => checkoutRowEligible(r)) && (
          <Button
            variant="outline"
            className="shrink-0 text-amber-700 border-amber-200 hover:bg-amber-50"
            disabled={checkoutAllLoading || checkoutDialogBusy}
            onClick={handleCheckoutAllEligible}
          >
            {checkoutAllLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            Check out eligible rooms
          </Button>
        )}
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bulk reservation details</h1>
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
          <CardDescription>
            Rooms and guests linked to this bulk reservation group (may also appear as bookings when checked in).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 px-4 pb-6 sm:px-6 [scrollbar-width:thin]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canManageFolio && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManageFolio ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No records found for this bulk group.
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(row.status === 'reserved' ? `/reservations/${row.id}` : `/bookings/${row.id}`)
                  }
                >
                  <TableCell className="font-mono text-xs">{row.folio_id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.guests?.name || 'Unassigned'}</div>
                    <div className="text-xs text-muted-foreground">{row.guests?.phone}</div>
                  </TableCell>
                  <TableCell>
                    {row.rooms?.room_number ? `Room ${row.rooms.room_number}` : 'Unassigned'}
                    <div className="text-xs text-muted-foreground">{row.rooms?.room_type}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.check_in} to {row.check_out}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatNaira(row.total_amount || 0)}</TableCell>
                  {canManageFolio && (
                    <TableCell className="text-right">
                      {checkoutRowEligible(row) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs text-amber-600 hover:text-amber-700 border-amber-200 hover:bg-amber-50"
                          disabled={checkoutRowId === row.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCheckoutOneRow(row)
                          }}
                        >
                          {checkoutRowId === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <LogOut className="mr-1 h-3 w-3 inline" />
                              Check out
                            </>
                          )}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
