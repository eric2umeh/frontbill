'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import type { PurchaseOrderStatus, StorePurchaseOrderRow } from '@/lib/store/purchase-order-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

const statusVariant: Record<
  PurchaseOrderStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  locked: 'default',
  cancelled: 'destructive',
}

export function PurchaseOrderList({ embedded = false }: { embedded?: boolean }) {
  const { organizationId, role } = useAuth()
  const canView = hasPermission(role, 'store:view')

  const [rows, setRows] = useState<StorePurchaseOrderRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('store_purchase_orders')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setRows((data as StorePurchaseOrderRow[]) || [])

      const ids = [
        ...new Set(
          (data || [])
            .flatMap((r: StorePurchaseOrderRow) => [r.created_by, r.store_controller_by].filter(Boolean)),
        ),
      ] as string[]
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        const map: Record<string, string> = {}
        ;(profs || []).forEach((p: { id: string; full_name: string | null }) => {
          map[p.id] = p.full_name?.trim() || p.id.slice(0, 8)
        })
        setNames(map)
      } else {
        setNames({})
      }
    } catch (e: unknown) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to load purchase orders')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    load()
  }, [load])

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
          <CardDescription>You don&apos;t have permission to view purchase orders.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Purchase orders</h1>
            <p className="text-sm text-muted-foreground">
              Record goods received from market or outside suppliers (bulk lines, totals, optional attachment).
            </p>
          </div>
          <Button asChild>
            <Link href="/store/purchase-orders/new">
              <Plus className="mr-2 h-4 w-4" />
              New purchase order
            </Link>
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Recent purchase orders</CardTitle>
            <CardDescription>Draft orders can be edited; locked orders require an admin unlock to change quantities.</CardDescription>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/store/purchase-orders/new">New PO</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No purchase orders yet.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium whitespace-nowrap">{r.reference}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(r.order_date), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>{r.department}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[r.status] ?? 'secondary'}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNaira(r.grand_total)}</TableCell>
                      <TableCell className="text-sm">
                        {r.created_by ? names[r.created_by] || `${r.created_by.slice(0, 8)}…` : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/store/purchase-orders/${r.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
