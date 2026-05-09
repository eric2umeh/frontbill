'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { allocateRequisitionReference } from '@/lib/store/requisition-reference'
import { STORE_SECTION_OPTIONS, UNIT_OPTIONS } from '@/lib/store/requisition-types'
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
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const DEPT_PRESETS = [
  'Kitchen',
  'Laundry',
  'Housekeeping',
  'F&B',
  'Front Office',
  'Engineering',
  'ICT',
  'Staff Food',
  'MTN',
  'Other',
]

type DraftLine = {
  key: string
  item_description: string
  unit: string
  qty_required: string
  remark: string
}

function emptyLine(): DraftLine {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `l-${Date.now()}`,
    item_description: '',
    unit: 'pcs',
    qty_required: '1',
    remark: '',
  }
}

export function RequisitionNewForm() {
  const router = useRouter()
  const { organizationId, userId, name, role } = useAuth()
  const canCreate = hasPermission(role, 'store:requisition') || hasPermission(role, 'store:view')

  const [storeSection, setStoreSection] = useState<string>('general')
  const [department, setDepartment] = useState('')
  const [deptPreset, setDeptPreset] = useState<string>(DEPT_PRESETS[0])
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine(), emptyLine()])
  const [saving, setSaving] = useState(false)

  const effectiveDepartment =
    deptPreset === 'Other' ? department.trim() || 'Other' : deptPreset

  const addRow = () => setLines((prev) => [...prev, emptyLine()])
  const removeRow = (key: string) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)))

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

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
    const parsed: { item_description: string; unit: string; qty_required: number; remark: string }[] =
      []
    for (const l of lines) {
      const q = Number(String(l.qty_required).replace(/,/g, '.'))
      if (!l.item_description.trim()) continue
      if (!Number.isFinite(q) || q <= 0) {
        toast.error(`Invalid quantity for “${l.item_description.slice(0, 40)}…”`)
        return
      }
      parsed.push({
        item_description: l.item_description.trim(),
        unit: l.unit,
        qty_required: q,
        remark: l.remark.trim() || '',
      })
    }
    if (!parsed.length) {
      toast.error('Add at least one line with an item and quantity.')
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      if (!supabase) {
        toast.error('Database not configured')
        setSaving(false)
        return
      }

      let reference = await allocateRequisitionReference(supabase, organizationId)
      const insertHeader = async (ref: string) =>
        supabase
          .from('store_requisitions')
          .insert({
            organization_id: organizationId,
            reference: ref,
            store_section: storeSection,
            department: dep,
            request_date: requestDate,
            status: 'submitted',
            requested_by: userId,
            notes: notes.trim() || null,
          })
          .select('id')
          .single()

      let { data: hdr, error: hErr } = await insertHeader(reference)
      if (hErr && hErr.code === '23505') {
        reference = `${reference}-${Math.random().toString(36).slice(2, 6)}`
        const retry = await insertHeader(reference)
        hdr = retry.data
        hErr = retry.error
      }
      if (hErr) throw hErr
      const reqId = hdr?.id as string
      if (!reqId) throw new Error('Missing requisition id')

      const lineRows = parsed.map((p, i) => ({
        requisition_id: reqId,
        line_no: i + 1,
        item_description: p.item_description,
        unit: p.unit,
        qty_required: p.qty_required,
        qty_issued: null,
        unit_cost: null,
        total_cost: null,
        remark: p.remark || null,
      }))

      const { error: lErr } = await supabase.from('store_requisition_lines').insert(lineRows)
      if (lErr) throw lErr

      toast.success(`Requisition ${reference} submitted`)
      router.push(`/store/requisitions/${reqId}`)
    } catch (err: unknown) {
      console.error(err)
      const msg =
        err &&
        typeof err === 'object' &&
        'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : 'Could not save requisition'
      if (msg.includes('relation') && msg.includes('does not exist')) {
        toast.error('Run the SQL migration scripts/037_store_requisitions.sql in Supabase first.')
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
          <CardTitle>New requisition</CardTitle>
          <CardDescription>You don&apos;t have permission to create requisitions.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
          <Link href="/store?tab=requisitions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New store requisition</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add one or many items — equivalent to a multi-line paper form. You are submitting as{' '}
          <span className="font-medium text-foreground">{name || 'staff'}</span>.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Header</CardTitle>
            <CardDescription>
              Pick the store section (Food, Beverage, HK, etc.) and your department — matches the paper
              workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Store section</Label>
              <Select value={storeSection} onValueChange={setStoreSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORE_SECTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Label htmlFor="dept-custom">Custom department</Label>
                <Input
                  id="dept-custom"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Kitchen, HK, Laundry…"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="req-date">Date</Label>
              <Input
                id="req-date"
                type="date"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <div>
              <CardTitle>Items required</CardTitle>
              <CardDescription>
                Quantity + unit (kg, pcs, bottles, etc.) — store will fill “Qty issued” and costs on the next
                screen.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add another item
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-28">Qty</TableHead>
                    <TableHead className="w-32">Unit</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={line.key}>
                      <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <Input
                          placeholder="e.g. Rice, Detergent, Tin milk…"
                          value={line.item_description}
                          onChange={(e) => updateLine(line.key, { item_description: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          value={line.qty_required}
                          onChange={(e) => updateLine(line.key, { qty_required: e.target.value })}
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
                          placeholder="Optional"
                          value={line.remark}
                          onChange={(e) => updateLine(line.key, { remark: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground"
                          onClick={() => removeRow(line.key)}
                          aria-label="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
              placeholder="Optional context for store (delivery time, event, etc.)"
              rows={3}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/store?tab=requisitions">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit requisition'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
