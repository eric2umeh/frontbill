'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { formatNaira } from '@/lib/utils/currency'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeft, Loader2, Package } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { StoreItemRow, MovementRow } from '@/lib/store/types'

type ProfileName = { id: string; full_name: string | null }

export function StoreItemDetail() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  const router = useRouter()
  const { role, organizationId } = useAuth()
  const canView = hasPermission(role, 'store:view')

  const [item, setItem] = useState<StoreItemRow | null>(null)
  const [categoryName, setCategoryName] = useState<string | null>(null)
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const resolveName = useCallback(
    (uid: string | null | undefined) => {
      if (!uid) return '—'
      return profileNames[uid] || uid.slice(0, 8) + '…'
    },
    [profileNames]
  )

  const load = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId || !id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: row, error: ie } = await supabase
        .from('store_items')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (ie) throw ie
      if (!row) {
        setItem(null)
        return
      }
      setItem(row as StoreItemRow)

      if (row.category_id) {
        const { data: cat } = await supabase
          .from('store_categories')
          .select('name')
          .eq('id', row.category_id)
          .maybeSingle()
        setCategoryName(cat?.name ?? null)
      } else {
        setCategoryName(null)
      }

      const { data: mov, error: me } = await supabase
        .from('store_stock_movements')
        .select('*')
        .eq('item_id', id)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(500)

      if (me) throw me
      const mlist = (mov || []) as MovementRow[]
      setMovements(mlist)

      const ids = new Set<string>()
      const cb = row.created_by
      const ub = row.updated_by
      if (cb) ids.add(cb)
      if (ub) ids.add(ub)
      mlist.forEach(m => {
        if (m.created_by) ids.add(m.created_by)
        if (m.received_by) ids.add(m.received_by)
      })

      if (ids.size > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('organization_id', organizationId)
          .in('id', Array.from(ids))

        const map: Record<string, string> = {}
        ;(profs as ProfileName[] | null)?.forEach(p => {
          map[p.id] = p.full_name || p.id.slice(0, 8)
        })
        setProfileNames(map)
      }
    } catch {
      setItem(null)
    } finally {
      setLoading(false)
    }
  }, [id, organizationId])

  useEffect(() => {
    void load()
  }, [load])

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Item</CardTitle>
          <CardDescription>You do not have access to the store.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
      </div>
    )
  }

  if (!item) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not found</CardTitle>
          <CardDescription>This item does not exist or is in another organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/store">Back to store</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const createdBy = item.created_by
  const updatedBy = item.updated_by

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push('/store')}>
          <ArrowLeft className="h-4 w-4" />
          Store
        </Button>
        <Badge variant="secondary" className="font-normal">
          Item detail
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/50">
              <Package className="h-6 w-6 text-amber-800 dark:text-amber-200" />
            </div>
            <div>
              <CardTitle className="text-2xl">{item.name}</CardTitle>
              <CardDescription className="mt-1">
                {categoryName ?? 'Uncategorized'} · {item.unit} ·{' '}
                {item.is_active ? 'Active' : 'Inactive'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">On hand</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {Number(item.quantity_on_hand).toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Reorder level</p>
            <p className="font-mono text-xl tabular-nums">{Number(item.reorder_level).toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Unit price</p>
            <p>{formatNaira(Number(item.unit_price))}</p>
          </div>
          {item.sku && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">SKU</p>
              <p className="font-mono text-sm">{item.sku}</p>
            </div>
          )}
          <div className="sm:col-span-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Audit</p>
            <p className="text-sm">
              <span className="text-muted-foreground">Created by:</span>{' '}
              {resolveName(createdBy)} ·{' '}
              <span className="text-muted-foreground">Recorded:</span>{' '}
              {format(parseISO(item.created_at), 'MMM d, yyyy HH:mm')}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Last updated by:</span>{' '}
              {updatedBy ? resolveName(updatedBy) : '—'} ·{' '}
              <span className="text-muted-foreground">Updated at:</span>{' '}
              {format(parseISO(item.updated_at), 'MMM d, yyyy HH:mm')}
            </p>
          </div>
          {item.notes && (
            <div className="sm:col-span-2 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Movement history</CardTitle>
          <CardDescription>
            Stock movements for this SKU — including who recorded the entry and who received stock at an outlet (when
            captured).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[min(480px,60vh)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Received by</TableHead>
                  <TableHead>Recorded by</TableHead>
                  <TableHead>Ref / notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(parseISO(m.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell className="capitalize">{m.movement_type}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Number(m.quantity) > 0 ? '+' : ''}
                        {Number(m.quantity).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {m.balance_after != null ? Number(m.balance_after).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{m.destination_department || '—'}</TableCell>
                      <TableCell className="text-sm">{resolveName(m.received_by)}</TableCell>
                      <TableCell className="text-sm">{resolveName(m.created_by)}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {[m.reference, m.notes].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </ScrollArea>
          {movements.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No movements yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
