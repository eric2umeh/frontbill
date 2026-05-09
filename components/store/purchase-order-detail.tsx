'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'
import { formatNaira } from '@/lib/utils/currency'
import type {
  StorePurchaseOrderLineRow,
  StorePurchaseOrderRow,
  StoreUnlockRequestRow,
} from '@/lib/store/purchase-order-types'
import { UNIT_OPTIONS } from '@/lib/store/requisition-types'
import { uploadStoreAttachment } from '@/lib/store/store-attachment-upload'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StoreAttachmentField } from '@/components/store/store-attachment-field'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'

function lineTotal(q: number, p: number) {
  return Math.round(q * p * 100) / 100
}

type LineEdit = StorePurchaseOrderLineRow & {
  quantityIn: string
  unitPriceIn: string
}

function toEdit(l: StorePurchaseOrderLineRow): LineEdit {
  return {
    ...l,
    quantityIn: String(l.quantity),
    unitPriceIn: String(l.unit_price),
  }
}

export function PurchaseOrderDetail() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { role, userId, organizationId } = useAuth()
  const canView = hasPermission(role, 'store:view')
  const rk = canonicalRoleKey(role)
  const isAdminUnlock = rk === 'admin' || rk === 'superadmin'

  const [po, setPo] = useState<StorePurchaseOrderRow | null>(null)
  const [lines, setLines] = useState<LineEdit[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [requests, setRequests] = useState<StoreUnlockRequestRow[]>([])
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)

  const locked = po?.status === 'locked'
  const draft = po?.status === 'draft'
  const canEditLines = draft || isAdminUnlock

  const load = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId || !id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: row, error: e1 } = await supabase
        .from('store_purchase_orders')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (e1) throw e1
      setPo((row as StorePurchaseOrderRow) || null)

      const { data: lrows, error: e2 } = await supabase
        .from('store_purchase_order_lines')
        .select('*')
        .eq('purchase_order_id', id)
        .order('line_no', { ascending: true })
      if (e2) throw e2
      setLines(((lrows || []) as StorePurchaseOrderLineRow[]).map(toEdit))

      const { data: urows } = await supabase
        .from('store_document_unlock_requests')
        .select('*')
        .eq('document_type', 'purchase_order')
        .eq('document_id', id)
        .order('created_at', { ascending: false })
      setRequests((urows as StoreUnlockRequestRow[]) || [])
    } catch (e: unknown) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to load')
      setPo(null)
    } finally {
      setLoading(false)
    }
  }, [id, organizationId])

  useEffect(() => {
    load()
  }, [load])

  const grandTotal = useMemo(() => {
    return lines.reduce((s, l) => {
      const q = parseFloat(l.quantityIn.replace(/,/g, '.'))
      const p = parseFloat(l.unitPriceIn.replace(/,/g, ''))
      if (!Number.isFinite(q) || !Number.isFinite(p)) return s
      return s + lineTotal(q, p)
    }, 0)
  }, [lines])

  const updateLineLocal = (lineId: string, patch: Partial<LineEdit>) => {
    if (!canEditLines) return
    setLines((prev) =>
      prev.map((row) => {
        if (row.id !== lineId) return row
        return { ...row, ...patch }
      }),
    )
  }

  const persistLinesAndHeader = async () => {
    if (!po || !organizationId || !canEditLines) return
    const supabase = createClient()
    if (!supabase) return
    setSaving(true)
    try {
      for (const l of lines) {
        const q = parseFloat(l.quantityIn.replace(/,/g, '.'))
        const p = parseFloat(l.unitPriceIn.replace(/,/g, ''))
        if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0) {
          toast.error('Every line needs a valid quantity and unit price.')
          setSaving(false)
          return
        }
        const lt = lineTotal(q, p)
        const { error } = await supabase
          .from('store_purchase_order_lines')
          .update({
            quantity: q,
            unit_price: p,
            line_total: lt,
            ref_note: l.ref_note,
            item_description: l.item_description,
            unit: l.unit,
          })
          .eq('id', l.id)
          .eq('purchase_order_id', po.id)
        if (error) throw error
      }

      const gt = lines.reduce((s, l) => {
        const q = parseFloat(l.quantityIn.replace(/,/g, '.'))
        const p = parseFloat(l.unitPriceIn.replace(/,/g, ''))
        return s + lineTotal(q, p)
      }, 0)

      const { error: hErr } = await supabase
        .from('store_purchase_orders')
        .update({ grand_total: gt })
        .eq('id', po.id)
        .eq('organization_id', organizationId)
      if (hErr) throw hErr

      toast.success('Saved')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const finalizeLock = async () => {
    if (!po || !organizationId) return
    const supabase = createClient()
    if (!supabase) return
    setSaving(true)
    try {
      for (const l of lines) {
        const q = parseFloat(l.quantityIn.replace(/,/g, '.'))
        const p = parseFloat(l.unitPriceIn.replace(/,/g, ''))
        if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0) {
          toast.error('Check all lines before locking.')
          setSaving(false)
          return
        }
        const lt = lineTotal(q, p)
        const { error: le } = await supabase
          .from('store_purchase_order_lines')
          .update({
            quantity: q,
            unit_price: p,
            line_total: lt,
            ref_note: l.ref_note,
            item_description: l.item_description,
            unit: l.unit,
          })
          .eq('id', l.id)
          .eq('purchase_order_id', po.id)
        if (le) throw le
      }
      const gt = lines.reduce((s, l) => {
        const q = parseFloat(l.quantityIn.replace(/,/g, '.'))
        const p = parseFloat(l.unitPriceIn.replace(/,/g, ''))
        return s + lineTotal(q, p)
      }, 0)
      const { error } = await supabase
        .from('store_purchase_orders')
        .update({ status: 'locked', grand_total: gt })
        .eq('id', po.id)
        .eq('organization_id', organizationId)
      if (error) throw error
      toast.success('Purchase order locked.')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not lock')
    } finally {
      setSaving(false)
    }
  }

  const submitUnlockRequest = async () => {
    if (!po || !userId || !organizationId || !unlockReason.trim()) {
      toast.error('Enter a reason for the administrator.')
      return
    }
    const supabase = createClient()
    if (!supabase) return
    setSaving(true)
    try {
      const { error } = await supabase.from('store_document_unlock_requests').insert({
        organization_id: organizationId,
        document_type: 'purchase_order',
        document_id: po.id,
        reason: unlockReason.trim(),
        requested_by: userId,
        status: 'pending',
      })
      if (error) throw error
      toast.success('Unlock request sent.')
      setUnlockOpen(false)
      setUnlockReason('')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const approveUnlock = async (reqId: string) => {
    if (!po || !userId || !organizationId || !isAdminUnlock) return
    const supabase = createClient()
    if (!supabase) return
    setSaving(true)
    try {
      const { error: u1 } = await supabase
        .from('store_document_unlock_requests')
        .update({
          status: 'approved',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reqId)
      if (u1) throw u1

      const { error: u2 } = await supabase
        .from('store_purchase_orders')
        .update({ status: 'draft' })
        .eq('id', po.id)
        .eq('organization_id', organizationId)
      if (u2) throw u2

      toast.success('Unlock approved.')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const rejectUnlock = async (reqId: string) => {
    if (!userId || !isAdminUnlock) return
    const supabase = createClient()
    if (!supabase) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_document_unlock_requests')
        .update({
          status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reqId)
      if (error) throw error
      toast.success('Request rejected.')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const markSignoff = async (field: 'store' | 'accountant' | 'gm') => {
    if (!po || !userId || !organizationId) return
    const supabase = createClient()
    if (!supabase) return
    const now = new Date().toISOString()
    const patch: Record<string, string | null> = {}
    if (field === 'store') {
      patch.store_controller_by = userId
      patch.store_controller_at = now
    } else if (field === 'accountant') {
      patch.accountant_by = userId
      patch.accountant_at = now
    } else {
      patch.gm_by = userId
      patch.gm_at = now
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_purchase_orders')
        .update(patch)
        .eq('id', po.id)
        .eq('organization_id', organizationId)
      if (error) throw error
      toast.success('Recorded.')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const saveAttachment = async () => {
    if (!po || !attachmentFile || !organizationId) return
    const supabase = createClient()
    if (!supabase) return
    setSaving(true)
    try {
      const { publicUrl, error: uErr } = await uploadStoreAttachment(supabase, attachmentFile, {
        organizationId,
        folder: 'purchase-orders',
        documentId: po.id,
      })
      if (uErr || !publicUrl) {
        toast.error(uErr || 'Upload failed')
        return
      }
      const { error } = await supabase
        .from('store_purchase_orders')
        .update({ attachment_url: publicUrl })
        .eq('id', po.id)
      if (error) throw error
      setAttachmentFile(null)
      toast.success('Attachment saved')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Purchase order</CardTitle>
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

  if (!po) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not found</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/store?tab=purchase_orders">Back</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const pendingUnlock = requests.find((r) => r.status === 'pending')

  return (
    <div className="space-y-6 max-w-6xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/store?tab=purchase_orders">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Purchase orders
        </Link>
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{po.reference}</h1>
            <Badge variant={locked ? 'default' : draft ? 'secondary' : 'outline'}>{po.status}</Badge>
            {locked && !isAdminUnlock ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Lines locked
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {po.department} · {format(parseISO(po.order_date), 'dd MMM yyyy')}
          </p>
        </div>
      </div>

      {po.notes ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm whitespace-pre-wrap">{po.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Line items</CardTitle>
            <CardDescription>
              {canEditLines
                ? 'Edit while draft; Administrators can edit locked POs directly.'
                : 'Locked — use Request edit unlock.'}
            </CardDescription>
          </div>
          {draft && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void persistLinesAndHeader()}>
                Save draft
              </Button>
              <Button type="button" disabled={saving} onClick={() => void finalizeLock()}>
                Finalize &amp; lock quantities
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Ref</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28">Unit</TableHead>
                  <TableHead className="w-32">Unit price</TableHead>
                  <TableHead className="text-right w-32">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const q = parseFloat(l.quantityIn.replace(/,/g, '.'))
                  const p = parseFloat(l.unitPriceIn.replace(/,/g, ''))
                  const lt =
                    Number.isFinite(q) && Number.isFinite(p) && q > 0 && p >= 0 ? lineTotal(q, p) : null
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        {canEditLines ? (
                          <Input
                            className="h-8"
                            value={l.ref_note || ''}
                            onChange={(e) => updateLineLocal(l.id, { ref_note: e.target.value })}
                          />
                        ) : (
                          l.ref_note || '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {canEditLines ? (
                          <Input
                            className="h-8"
                            value={l.item_description}
                            onChange={(e) => updateLineLocal(l.id, { item_description: e.target.value })}
                          />
                        ) : (
                          l.item_description
                        )}
                      </TableCell>
                      <TableCell>
                        {canEditLines ? (
                          <Input
                            className="h-8"
                            inputMode="decimal"
                            value={l.quantityIn}
                            onChange={(e) => updateLineLocal(l.id, { quantityIn: e.target.value })}
                          />
                        ) : (
                          l.quantity
                        )}
                      </TableCell>
                      <TableCell>
                        {canEditLines ? (
                          <Select value={l.unit} onValueChange={(u) => updateLineLocal(l.id, { unit: u })}>
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIT_OPTIONS.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          l.unit
                        )}
                      </TableCell>
                      <TableCell>
                        {canEditLines ? (
                          <Input
                            className="h-8"
                            inputMode="decimal"
                            value={l.unitPriceIn}
                            onChange={(e) => updateLineLocal(l.id, { unitPriceIn: e.target.value })}
                          />
                        ) : (
                          formatNaira(l.unit_price)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {lt != null ? formatNaira(lt) : formatNaira(l.line_total)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-right mt-3">
            Grand total:{' '}
            <span className="font-semibold">{formatNaira(grandTotal || po.grand_total)}</span>
          </p>
        </CardContent>
      </Card>

      {locked && !isAdminUnlock && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Need to correct quantities?</CardTitle>
            <CardDescription>
              Submit a request — only an Administrator or Superadmin can unlock for editing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setUnlockOpen(true)}>
              Request edit unlock
            </Button>
            {pendingUnlock ? (
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-3">
                A pending unlock request is awaiting review.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {isAdminUnlock && requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unlock requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-medium">{r.status}</p>
                  <p className="text-muted-foreground">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">{format(parseISO(r.created_at), 'PPp')}</p>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={saving} onClick={() => void approveUnlock(r.id)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => void rejectUnlock(r.id)}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {locked && canView && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign-off</CardTitle>
            <CardDescription>Store / cost controller, Accountant, General manager.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!po.store_controller_at ? (
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void markSignoff('store')}>
                Store / cost controller
              </Button>
            ) : (
              <Badge variant="outline">
                Store ✓ {po.store_controller_at ? format(parseISO(po.store_controller_at), 'dd/MM/yy') : ''}
              </Badge>
            )}
            {!po.accountant_at ? (
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void markSignoff('accountant')}>
                Accountant
              </Button>
            ) : (
              <Badge variant="outline">Accountant ✓</Badge>
            )}
            {!po.gm_at ? (
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void markSignoff('gm')}>
                General manager
              </Button>
            ) : (
              <Badge variant="outline">GM ✓</Badge>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attachment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {po.attachment_url ? (
            <p className="text-sm">
              <a
                href={po.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                View attachment
              </a>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No attachment.</p>
          )}
          <StoreAttachmentField
            label="Upload or replace"
            file={attachmentFile}
            onFileChange={setAttachmentFile}
          />
          {attachmentFile ? (
            <Button type="button" size="sm" disabled={saving} onClick={() => void saveAttachment()}>
              Upload
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request edit unlock</DialogTitle>
            <DialogDescription>Reason for changing quantities or prices (sent to Administrator / Superadmin).</DialogDescription>
          </DialogHeader>
          <Textarea
            value={unlockReason}
            onChange={(e) => setUnlockReason(e.target.value)}
            placeholder="Reason…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitUnlockRequest()} disabled={saving || !unlockReason.trim()}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
