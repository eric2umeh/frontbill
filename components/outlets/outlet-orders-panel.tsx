'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatNaira } from '@/lib/utils/currency'
import { formatPaymentMethodLabel } from '@/lib/payments/payment-methods'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileText, Pencil, Printer, Loader2, Trash2 } from 'lucide-react'
import { OutletSettleOrderDialog } from '@/components/outlets/outlet-settle-order-dialog'
import { OutletEditOrderDialog } from '@/components/outlets/outlet-edit-order-dialog'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { toast } from 'sonner'
import { usePaginatedList } from '@/lib/hooks/use-paginated-list'
import { TableListControls } from '@/components/shared/table-list-controls'

type Props = {
  orders: OutletOrderRow[]
  organizationId: string
  departmentLabel: string
  canPrintReceipt?: boolean
  canSell?: boolean
  canManageOrders?: boolean
  showTodaySummary?: boolean
  onPrintUnsettled?: (order: OutletOrderRow) => void
  onPrintSettled?: (order: OutletOrderRow) => void
  onSettled?: () => void
  onOrdersChanged?: () => void
}

export function OutletOrdersPanel({
  orders,
  organizationId,
  departmentLabel,
  canPrintReceipt,
  canSell,
  canManageOrders,
  showTodaySummary = true,
  onPrintUnsettled,
  onPrintSettled,
  onSettled,
  onOrdersChanged,
}: Props) {
  const [settleTarget, setSettleTarget] = useState<OutletOrderRow | null>(null)
  const [editTarget, setEditTarget] = useState<OutletOrderRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OutletOrderRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const {
    paginatedItems: visibleOrders,
    page,
    setPage,
    totalPages,
    totalCount,
    startIndex,
    pageSize,
  } = usePaginatedList<OutletOrderRow>({
    items: orders,
    pageSize: 20,
    search,
    searchMatch: (o, query) => {
      const q = query.trim().toLowerCase()
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.guest_name ?? '').toLowerCase().includes(q) ||
        (o.room_number ?? '').toLowerCase().includes(q) ||
        (o.table_label ?? '').toLowerCase().includes(q)
      )
    },
    activeFilters: { status: statusFilter },
    filterMatch: (o, key, value) => {
      if (key !== 'status') return undefined
      if (value === 'open') return o.status === 'open'
      if (value === 'settled') return o.status === 'settled'
      if (value === 'void') return o.status === 'void'
      return true
    },
  })

  const todayTotal = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return orders
      .filter((o) => o.status === 'settled' && o.created_at.startsWith(today))
      .reduce((s, o) => s + Number(o.subtotal), 0)
  }, [orders])

  const handleSettled = (order: OutletOrderRow) => {
    onSettled?.()
    if (canPrintReceipt && onPrintSettled) {
      onPrintSettled(order)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const needsReason = deleteTarget.status === 'settled'
    if (needsReason && !voidReason.trim()) {
      toast.error('Enter a reason to void this settled order')
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/outlets/orders/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await outletApiHeaders()) },
        credentials: 'include',
        body: JSON.stringify({ reason: voidReason.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not remove order')
        return
      }
      toast.success(
        json.deleted ? 'Open bill deleted' : 'Order voided',
      )
      setDeleteTarget(null)
      setVoidReason('')
      onOrdersChanged?.()
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  const showActionsCol = canManageOrders || canSell || canPrintReceipt

  return (
    <div className="space-y-3">
      {showTodaySummary && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Today&apos;s settled sales</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <p className="text-xl font-bold">{formatNaira(todayTotal)}</p>
            <p className="text-[10px] text-muted-foreground">
              {orders.filter((o) => o.status === 'settled').length} settled ·{' '}
              {orders.filter((o) => o.status === 'open').length} open bills
            </p>
          </CardContent>
        </Card>
      )}

      <TableListControls
        section="toolbar"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search receipt #, guest, room, table…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'open', label: 'Unsettled' },
              { value: 'settled', label: 'Settled' },
              { value: 'void', label: 'Void' },
            ],
          },
        ]}
        activeFilters={{ status: statusFilter }}
        onFilterChange={(_, value) => setStatusFilter(value)}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        startIndex={startIndex}
        pageSize={pageSize}
        totalCount={totalCount}
      />

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Receipt #</th>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Guest</th>
              <th className="text-right p-2">Items</th>
              <th className="text-right p-2">Total</th>
              <th className="p-2">Pay</th>
              <th className="p-2">Status</th>
              {showActionsCol && <th className="p-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2 font-mono">{o.order_number}</td>
                <td className="p-2 text-muted-foreground">
                  {format(parseISO(o.created_at), 'dd MMM · HH:mm')}
                </td>
                <td className="p-2">{o.guest_name || o.room_number || '—'}</td>
                <td className="p-2 text-right text-muted-foreground">
                  {(o.outlet_order_lines ?? []).reduce((s, l) => s + (Number(l.qty) || 0), 0)}
                </td>
                <td className="p-2 text-right font-medium">{formatNaira(o.subtotal)}</td>
                <td className="p-2">
                  {o.is_complimentary
                    ? 'Complimentary'
                    : o.status === 'settled'
                      ? formatPaymentMethodLabel(o.payment_method)
                      : '—'}
                </td>
                <td className="p-2">
                  <Badge
                    variant={o.status === 'settled' ? 'default' : o.status === 'open' ? 'outline' : 'secondary'}
                    className="text-[10px]"
                  >
                    {o.status === 'open' ? 'unsettled' : o.status}
                  </Badge>
                </td>
                {showActionsCol && (
                  <td className="p-2">
                    <div className="flex justify-end gap-0.5 flex-wrap">
                      {canManageOrders && (o.status === 'open' || o.status === 'settled') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Edit order"
                          onClick={() => setEditTarget(o)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canManageOrders && (o.status === 'open' || o.status === 'settled') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title={o.status === 'open' ? 'Delete open bill' : 'Void settled order'}
                          onClick={() => {
                            setVoidReason('')
                            setDeleteTarget(o)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canPrintReceipt && (o.status === 'open' || o.status === 'settled') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Print unsettled bill"
                          onClick={() => onPrintUnsettled?.(o)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canPrintReceipt && o.status === 'settled' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Print settled receipt"
                          onClick={() => onPrintSettled?.(o)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canSell && o.status === 'open' && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-[10px] px-2"
                          onClick={() => setSettleTarget(o)}
                        >
                          Settle
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {totalCount === 0 && (
          <p className="p-6 text-center text-muted-foreground text-sm">
            {orders.length === 0 ? 'No orders yet' : 'No orders match your search or filters'}
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <TableListControls
          section="pagination"
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          startIndex={startIndex}
          pageSize={pageSize}
          totalCount={totalCount}
        />
      )}

      <OutletSettleOrderDialog
        order={settleTarget}
        open={!!settleTarget}
        onOpenChange={(open) => !open && setSettleTarget(null)}
        organizationId={organizationId}
        departmentLabel={departmentLabel}
        onSettled={handleSettled}
      />

      <OutletEditOrderDialog
        order={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSaved={() => {
          onOrdersChanged?.()
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setVoidReason('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.status === 'open' ? 'Delete open bill?' : 'Void settled order?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.status === 'open'
                ? `Permanently remove receipt ${deleteTarget?.order_number}. Any open folio charge on the booking will be removed.`
                : `Void receipt ${deleteTarget?.order_number} and reverse its payment, transaction, folio, and city ledger entries across reports and analytics.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget?.status === 'settled' && (
            <div className="space-y-1 py-1">
              <Label htmlFor="void-reason" className="text-xs">
                Reason (required)
              </Label>
              <Input
                id="void-reason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. entered in error"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : deleteTarget?.status === 'open' ? 'Delete' : 'Void'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
