'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { formatNaira } from '@/lib/utils/currency'
import type {
  RequisitionStatus,
  StoreRequisitionLineRow,
  StoreRequisitionRow,
} from '@/lib/store/requisition-types'
import { STORE_SECTION_OPTIONS } from '@/lib/store/requisition-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'

function sectionLabel(value: string) {
  return STORE_SECTION_OPTIONS.find((o) => o.value === value)?.label ?? value
}

const statusBadge: Record<RequisitionStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'secondary',
  processing: 'default',
  fulfilled: 'outline',
  cancelled: 'destructive',
}

type LineEdit = StoreRequisitionLineRow & {
  qty_issued_in: string
  unit_cost_in: string
}

function toEditLine(l: StoreRequisitionLineRow): LineEdit {
  const qi = l.qty_issued
  const uc = l.unit_cost
  return {
    ...l,
    qty_issued_in: qi != null && Number.isFinite(Number(qi)) ? String(qi) : '',
    unit_cost_in: uc != null && Number.isFinite(Number(uc)) ? String(uc) : '',
  }
}

export function RequisitionDetail() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { role, userId, organizationId, name } = useAuth()

  const canView = hasPermission(role, 'store:requisition') || hasPermission(role, 'store:view')
  const canFulfill = hasPermission(role, 'store:issue') || hasPermission(role, 'store:adjust')
  const canAccount = hasPermission(role, 'store:view')

  const [req, setReq] = useState<StoreRequisitionRow | null>(null)
  const [lines, setLines] = useState<LineEdit[]>([])
  const [requesterName, setRequesterName] = useState<string>('')
  const [fulfillerName, setFulfillerName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [receivedBy, setReceivedBy] = useState('')
  const [debitAccount, setDebitAccount] = useState('')
  const [creditAccount, setCreditAccount] = useState('')
  const [accountantNotes, setAccountantNotes] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId || !id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: row, error: e1 } = await supabase
        .from('store_requisitions')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (e1) throw e1
      if (!row) {
        setReq(null)
        return
      }
      const r = row as StoreRequisitionRow
      setReq(r)
      setReceivedBy(r.received_by_name || '')
      setDebitAccount(r.debit_account || '')
      setCreditAccount(r.credit_account || '')
      setAccountantNotes(r.accountant_notes || '')

      const { data: lrows, error: e2 } = await supabase
        .from('store_requisition_lines')
        .select('*')
        .eq('requisition_id', id)
        .order('line_no', { ascending: true })
      if (e2) throw e2
      setLines(((lrows || []) as StoreRequisitionLineRow[]).map(toEditLine))

      const ids = [r.requested_by, r.fulfilled_by].filter(Boolean) as string[]
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        const map: Record<string, string> = {}
        ;(profs || []).forEach((p: { id: string; full_name: string | null }) => {
          map[p.id] = p.full_name?.trim() || ''
        })
        if (r.requested_by) setRequesterName(map[r.requested_by] || r.requested_by.slice(0, 8) + '…')
        if (r.fulfilled_by) setFulfillerName(map[r.fulfilled_by] || r.fulfilled_by.slice(0, 8) + '…')
      } else {
        setRequesterName('')
        setFulfillerName('')
      }
    } catch (err: unknown) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to load requisition')
      setReq(null)
    } finally {
      setLoading(false)
    }
  }, [id, organizationId])

  useEffect(() => {
    load()
  }, [load])

  const grossTotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.total_cost) || 0), 0),
    [lines],
  )

  const updateLineField = (lineId: string, patch: Partial<LineEdit>) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.id !== lineId) return row
        const next = { ...row, ...patch }
        const qIssued = parseFloat(String(next.qty_issued_in).replace(/,/g, '.'))
        const uCost = parseFloat(String(next.unit_cost_in).replace(/,/g, ''))
        let total: number | null = null
        if (Number.isFinite(qIssued) && Number.isFinite(uCost) && qIssued >= 0 && uCost >= 0) {
          total = Math.round(qIssued * uCost * 100) / 100
        }
        return { ...next, total_cost: total }
      }),
    )
  }

  const persistFulfillment = async (nextStatus: RequisitionStatus) => {
    if (!req || !organizationId || !userId) return
    const supabase = createClient()
    if (!supabase) {
      toast.error('Database not configured')
      return
    }
    setSaving(true)
    try {
      for (const l of lines) {
        const qRaw = l.qty_issued_in.trim()
        const cRaw = l.unit_cost_in.trim()
        const qIssued =
          qRaw === '' ? null : Math.round(parseFloat(qRaw.replace(/,/g, '.')) * 1000) / 1000
        const unitCost =
          cRaw === '' ? null : Math.round(parseFloat(cRaw.replace(/,/g, '')) * 100) / 100
        let totalCost: number | null = null
        if (qIssued != null && unitCost != null && qIssued >= 0 && unitCost >= 0) {
          totalCost = Math.round(qIssued * unitCost * 100) / 100
        }
        const { error: uErr } = await supabase
          .from('store_requisition_lines')
          .update({
            qty_issued: qIssued,
            unit_cost: unitCost,
            total_cost: totalCost,
            remark: l.remark,
          })
          .eq('id', l.id)
          .eq('requisition_id', req.id)
        if (uErr) throw uErr
      }

      const { error: hErr } = await supabase
        .from('store_requisitions')
        .update({
          status: nextStatus,
          fulfilled_by:
            nextStatus === 'fulfilled' || nextStatus === 'processing' ? userId : req.fulfilled_by,
          fulfilled_at:
            nextStatus === 'fulfilled'
              ? new Date().toISOString()
              : nextStatus === 'processing'
                ? req.fulfilled_at || new Date().toISOString()
                : req.fulfilled_at,
          received_by_name: receivedBy.trim() || null,
          debit_account: debitAccount.trim() || null,
          credit_account: creditAccount.trim() || null,
          accountant_notes: accountantNotes.trim() || null,
        })
        .eq('id', req.id)
        .eq('organization_id', organizationId)
      if (hErr) throw hErr

      toast.success('Saved')
      load()
    } catch (err: unknown) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onCancelReq = async () => {
    if (!req || !organizationId) return
    const supabase = createClient()
    if (!supabase) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_requisitions')
        .update({ status: 'cancelled' })
        .eq('id', req.id)
        .eq('organization_id', organizationId)
      if (error) throw error
      toast.success('Requisition cancelled')
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel')
    } finally {
      setSaving(false)
    }
  }

  const persistAccountingHeader = async () => {
    if (!req || !organizationId) return
    const supabase = createClient()
    if (!supabase) {
      toast.error('Database not configured')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_requisitions')
        .update({
          received_by_name: receivedBy.trim() || null,
          debit_account: debitAccount.trim() || null,
          credit_account: creditAccount.trim() || null,
          accountant_notes: accountantNotes.trim() || null,
        })
        .eq('id', req.id)
        .eq('organization_id', organizationId)
      if (error) throw error
      toast.success('Saved account fields')
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Requisition</CardTitle>
          <CardDescription>No access.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    )
  }

  if (!req) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not found</CardTitle>
          <CardDescription>This requisition does not exist or was removed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/store?tab=requisitions">Back to list</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const isTerminal = req.status === 'fulfilled' || req.status === 'cancelled'
  const showFulfillCols = canFulfill && !isTerminal
  const readOnlyFulfill = !canFulfill || isTerminal
  const accountingReadOnly = !canAccount || req.status === 'cancelled'

  return (
    <div className="space-y-6 max-w-6xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/store?tab=requisitions">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All requisitions
        </Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{req.reference}</h1>
            <Badge variant={statusBadge[req.status] ?? 'secondary'}>{req.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {sectionLabel(req.store_section)} · {req.department} ·{' '}
            {format(parseISO(req.request_date), 'EEEE, dd MMM yyyy')}
          </p>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>
            <span className="font-medium text-foreground">Requested by:</span>{' '}
            {requesterName || '—'}
          </div>
          {req.fulfilled_by ? (
            <div>
              <span className="font-medium text-foreground">Last fulfilled by:</span> {fulfillerName}
            </div>
          ) : null}
        </div>
      </div>

      {req.notes ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Request notes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm whitespace-pre-wrap">{req.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
          <CardDescription>
            {readOnlyFulfill
              ? 'Quantity issued and costs as recorded.'
              : 'Enter quantity issued and unit cost; line total updates automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="whitespace-nowrap">Qty required</TableHead>
                  <TableHead className="whitespace-nowrap">Qty issued</TableHead>
                  <TableHead className="whitespace-nowrap">Unit cost</TableHead>
                  <TableHead className="whitespace-nowrap">Total</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                    <TableCell className="font-medium">{l.item_description}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.qty_required} {l.unit}
                    </TableCell>
                    <TableCell className="min-w-[100px]">
                      {readOnlyFulfill ? (
                        <span>{l.qty_issued != null ? `${l.qty_issued} ${l.unit}` : '—'}</span>
                      ) : (
                        <Input
                          className="h-8"
                          inputMode="decimal"
                          placeholder="0"
                          value={l.qty_issued_in}
                          onChange={(e) =>
                            updateLineField(l.id, { qty_issued_in: e.target.value })
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="min-w-[110px]">
                      {readOnlyFulfill ? (
                        <span>{l.unit_cost != null ? formatNaira(l.unit_cost) : '—'}</span>
                      ) : (
                        <Input
                          className="h-8"
                          inputMode="decimal"
                          placeholder="₦"
                          value={l.unit_cost_in}
                          onChange={(e) =>
                            updateLineField(l.id, { unit_cost_in: e.target.value })
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {l.total_cost != null ? formatNaira(l.total_cost) : '—'}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      {readOnlyFulfill ? (
                        <span className="text-sm text-muted-foreground">{l.remark || '—'}</span>
                      ) : (
                        <Input
                          className="h-8"
                          value={l.remark || ''}
                          onChange={(e) =>
                            updateLineField(l.id, { remark: e.target.value || null })
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {lines.length > 0 && (
            <p className="text-sm text-right text-muted-foreground mt-3">
              Document total:{' '}
              <span className="font-medium text-foreground">{formatNaira(grossTotal)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {canAccount && (
        <Card>
          <CardHeader>
            <CardTitle>For accounts use</CardTitle>
            <CardDescription>Debit / credit postings (paper form footer).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Debit account</Label>
              <Textarea
                rows={2}
                value={debitAccount}
                onChange={(e) => setDebitAccount(e.target.value)}
                readOnly={accountingReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label>Credit account</Label>
              <Textarea
                rows={2}
                value={creditAccount}
                onChange={(e) => setCreditAccount(e.target.value)}
                readOnly={accountingReadOnly}
              />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Accountant notes</Label>
              <Textarea
                rows={2}
                value={accountantNotes}
                onChange={(e) => setAccountantNotes(e.target.value)}
                readOnly={accountingReadOnly}
              />
            </div>
            {!accountingReadOnly && (
              <div className="sm:col-span-2">
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={persistAccountingHeader}>
                  Save account fields
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showFulfillCols && (
        <Card>
          <CardHeader>
            <CardTitle>Receive and close</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="received-by">Received by (name)</Label>
              <Input
                id="received-by"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder={name || 'Who collected from store'}
              />
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => persistFulfillment('processing')}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save progress'}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => persistFulfillment('fulfilled')}
              >
                Mark fulfilled
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isTerminal && canFulfill && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancelReq}>
            Cancel requisition
          </Button>
        </div>
      )}
    </div>
  )
}
