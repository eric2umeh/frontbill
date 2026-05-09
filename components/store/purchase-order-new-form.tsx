'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { allocatePurchaseOrderReference } from '@/lib/store/purchase-order-reference'
import { UNIT_OPTIONS } from '@/lib/store/requisition-types'
import { uploadStoreAttachment } from '@/lib/store/store-attachment-upload'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StoreAttachmentField } from '@/components/store/store-attachment-field'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'

const DEPT_PRESETS = [
  'Kitchen',
  'Laundry',
  'Housekeeping',
  'F&B',
  'Store',
  'Other',
]

type DraftLine = {
  key: string
  ref_note: string
  item_description: string
  quantity: string
  unit: string
  unit_price: string
}

function emptyLine(): DraftLine {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `l-${Date.now()}`,
    ref_note: '',
    item_description: '',
    quantity: '1',
    unit: 'kg',
    unit_price: '',
  }
}

function lineTotal(q: number, p: number) {
  return Math.round(q * p * 100) / 100
}

export function PurchaseOrderNewForm() {
  const router = useRouter()
  const { organizationId, userId, role } = useAuth()
  const canCreate = hasPermission(role, 'store:view')

  const [deptPreset, setDeptPreset] = useState(DEPT_PRESETS[0])
  const [departmentCustom, setDepartmentCustom] = useState('')
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [deliveryDate, setDeliveryDate] = useState('')
  const [purchaseRequestRef, setPurchaseRequestRef] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine(), emptyLine()])
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const effectiveDepartment =
    deptPreset === 'Other' ? departmentCustom.trim() || 'Other' : deptPreset

  const addRow = () => setLines((prev) => [...prev, emptyLine()])
  const removeRow = (key: string) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)))

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const docGrandTotal = lines.reduce((sum, l) => {
    const q = parseFloat(String(l.quantity).replace(/,/g, '.'))
    const p = parseFloat(String(l.unit_price).replace(/,/g, ''))
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p < 0) return sum
    return sum + lineTotal(q, p)
  }, 0)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organizationId || !userId) {
      toast.error('Sign in again — missing organization.')
      return
    }
    const dep = effectiveDepartment.trim()
    if (!dep) {
      toast.error('Choose or enter a department.')
      return
    }

    const parsed: {
      ref_note: string
      item_description: string
      quantity: number
      unit: string
      unit_price: number
      line_total: number
    }[] = []

    for (const l of lines) {
      if (!l.item_description.trim()) continue
      const q = parseFloat(String(l.quantity).replace(/,/g, '.'))
      const p = parseFloat(String(l.unit_price).replace(/,/g, ''))
      if (!Number.isFinite(q) || q <= 0) {
        toast.error(`Invalid quantity for “${l.item_description.slice(0, 40)}…”`)
        return
      }
      if (!Number.isFinite(p) || p < 0) {
        toast.error(`Invalid unit price for “${l.item_description.slice(0, 40)}…”`)
        return
      }
      parsed.push({
        ref_note: l.ref_note.trim(),
        item_description: l.item_description.trim(),
        quantity: q,
        unit: l.unit,
        unit_price: p,
        line_total: lineTotal(q, p),
      })
    }

    if (!parsed.length) {
      toast.error('Add at least one line with item, quantity, and unit price.')
      return
    }

    const grandTotal = parsed.reduce((s, x) => s + x.line_total, 0)

    setSaving(true)
    try {
      const supabase = createClient()
      if (!supabase) {
        toast.error('Database not configured')
        setSaving(false)
        return
      }

      let reference = await allocatePurchaseOrderReference(supabase, organizationId)
      const insertHeader = async (ref: string) =>
        supabase
          .from('store_purchase_orders')
          .insert({
            organization_id: organizationId,
            reference: ref,
            order_date: orderDate,
            department: dep,
            delivery_date: deliveryDate.trim() || null,
            purchase_request_ref: purchaseRequestRef.trim() || null,
            notes: notes.trim() || null,
            status: 'draft',
            grand_total: grandTotal,
            created_by: userId,
          })
          .select('id')
          .single()

      let { data: hdr, error: hErr } = await insertHeader(reference)
      if (hErr && (hErr as { code?: string }).code === '23505') {
        reference = `${reference}-${Math.random().toString(36).slice(2, 6)}`
        const retry = await insertHeader(reference)
        hdr = retry.data
        hErr = retry.error
      }
      if (hErr) throw hErr
      const poId = hdr?.id as string
      if (!poId) throw new Error('Missing purchase order id')

      const lineRows = parsed.map((p, i) => ({
        purchase_order_id: poId,
        line_no: i + 1,
        ref_note: p.ref_note || null,
        item_description: p.item_description,
        quantity: p.quantity,
        unit: p.unit,
        unit_price: p.unit_price,
        line_total: p.line_total,
      }))

      const { error: lErr } = await supabase.from('store_purchase_order_lines').insert(lineRows)
      if (lErr) throw lErr

      if (attachmentFile) {
        const { publicUrl, error: uErr } = await uploadStoreAttachment(supabase, attachmentFile, {
          organizationId,
          folder: 'purchase-orders',
          documentId: poId,
        })
        if (uErr) {
          toast.error(uErr)
        } else if (publicUrl) {
          await supabase.from('store_purchase_orders').update({ attachment_url: publicUrl }).eq('id', poId)
        }
      }

      toast.success(`${reference} saved as draft — open it to finalize and lock quantities.`)
      router.push(`/store/purchase-orders/${poId}`)
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Could not save purchase order'
      if (msg.includes('relation') && msg.includes('does not exist')) {
        toast.error('Run the SQL migration scripts/038_store_purchase_orders.sql in Supabase.')
      } else {
        toast.error(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!canCreate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Purchase order</CardTitle>
          <CardDescription>No access.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
        <Link href="/store?tab=purchase_orders">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to store
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New purchase order</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Record market or supplier purchases in bulk. Save as draft first, then open the PO to finalize and lock line
          quantities.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Order details</CardTitle>
            <CardDescription>Matches the paper PO header (date, department, optional delivery &amp; PR ref).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Order date</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={deptPreset} onValueChange={setDeptPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPT_PRESETS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {deptPreset === 'Other' && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Custom department</Label>
                <Input
                  value={departmentCustom}
                  onChange={(e) => setDepartmentCustom(e.target.value)}
                  placeholder="Department name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Delivery date</Label>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Purchase request no. (optional)</Label>
              <Input
                value={purchaseRequestRef}
                onChange={(e) => setPurchaseRequestRef(e.target.value)}
                placeholder="Link to internal PR #"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <div>
              <CardTitle>Line items</CardTitle>
              <CardDescription>Ref, description, quantity, unit price — total per line is calculated.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add line
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Ref</TableHead>
                    <TableHead>Item &amp; description</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-28">Unit</TableHead>
                    <TableHead className="w-32">Unit price</TableHead>
                    <TableHead className="w-32 text-right">Line total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const q = parseFloat(String(line.quantity).replace(/,/g, '.'))
                    const p = parseFloat(String(line.unit_price).replace(/,/g, ''))
                    const lt =
                      Number.isFinite(q) && Number.isFinite(p) && q > 0 && p >= 0 ? lineTotal(q, p) : null
                    return (
                      <TableRow key={line.key}>
                        <TableCell>
                          <Input
                            className="h-9"
                            placeholder="—"
                            value={line.ref_note}
                            onChange={(e) => updateLine(line.key, { ref_note: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="e.g. Plantain, Titus fish…"
                            value={line.item_description}
                            onChange={(e) => updateLine(line.key, { item_description: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-9"
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={line.unit}
                            onValueChange={(u) => updateLine(line.key, { unit: u })}
                          >
                            <SelectTrigger className="h-9">
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
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-9"
                            inputMode="decimal"
                            placeholder="₦"
                            value={line.unit_price}
                            onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {lt != null ? formatNaira(lt) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRow(line.key)}
                            aria-label="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-sm text-right text-muted-foreground mt-3">
              Document total: <span className="font-medium text-foreground">{formatNaira(docGrandTotal)}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Supplementary list for house & breakfast @ market"
              rows={3}
            />
          </CardContent>
        </Card>

        <StoreAttachmentField
          label="Attachment (optional)"
          description="Photo or scan of the signed paper PO."
          file={attachmentFile}
          onFileChange={setAttachmentFile}
        />

        <div className="flex flex-wrap gap-3 justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/store?tab=purchase_orders">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save draft'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
