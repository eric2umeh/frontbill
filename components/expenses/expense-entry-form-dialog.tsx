'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export type ExpenseCategoryOption = {
  id: string
  name: string
  code: string
  is_active?: boolean
}

export type ExpenseEntryFormValues = {
  id?: string
  expense_date: string
  category_id: string
  amount: string
  description: string
  payment_method: string
  reference: string
}

export type ExpenseEntryRecord = ExpenseEntryFormValues & {
  created_at?: string
  updated_at?: string
  created_by?: string
  created_by_name?: string | null
  updated_by?: string | null
  updated_by_name?: string | null
  expense_categories?: { name: string } | { name: string }[] | null
}

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank transfer' },
  { value: 'pos', label: 'POS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

function emptyForm(): ExpenseEntryFormValues {
  return {
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    category_id: '',
    amount: '',
    description: '',
    payment_method: 'cash',
    reference: '',
  }
}

function fromRecord(entry: ExpenseEntryRecord): ExpenseEntryFormValues {
  return {
    id: entry.id,
    expense_date: String(entry.expense_date || '').slice(0, 10),
    category_id: entry.category_id,
    amount: String(entry.amount ?? ''),
    description: entry.description || '',
    payment_method: entry.payment_method || 'cash',
    reference: entry.reference || '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  categories: ExpenseCategoryOption[]
  initial?: ExpenseEntryRecord | null
  onSaved: () => void
}

export function ExpenseEntryFormDialog({
  open,
  onClose,
  userId,
  categories,
  initial,
  onSaved,
}: Props) {
  const [form, setForm] = useState<ExpenseEntryFormValues>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const isEdit = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setForm(initial ? fromRecord(initial) : emptyForm())
  }, [open, initial])

  const activeCategories = categories.filter((c) => c.is_active !== false)

  const handleSubmit = async () => {
    if (!form.category_id) {
      toast.error('Select a category')
      return
    }
    const amt = Number(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (!form.expense_date) {
      toast.error('Expense date is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caller_id: userId,
          entry: {
            id: form.id,
            expense_date: form.expense_date,
            category_id: form.category_id,
            amount: amt,
            description: form.description.trim() || null,
            payment_method: form.payment_method || null,
            reference: form.reference.trim() || null,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      toast.success(isEdit ? 'Expense updated' : 'Expense recorded')
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[min(92dvh,640px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this line. The original recorded time is kept; last update time refreshes on save.'
              : 'Each save creates a new expense line with a timestamp.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Category *</Label>
            <Select
              value={form.category_id || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No categories — add one under Categories tab
                  </div>
                ) : (
                  activeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exp_amount">Amount (₦) *</Label>
            <Input
              id="exp_amount"
              type="number"
              min={0}
              inputMode="decimal"
              className="text-base"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exp_date">Expense date *</Label>
            <Input
              id="exp_date"
              type="date"
              className="text-base"
              value={form.expense_date}
              onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Payment method</Label>
            <Select
              value={form.payment_method}
              onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="exp_desc">Description</Label>
            <Textarea
              id="exp_desc"
              rows={2}
              placeholder="e.g. Fire service levy, diesel for generator"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="exp_ref">Reference / receipt no.</Label>
            <Input
              id="exp_ref"
              placeholder="Invoice or receipt #"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            />
          </div>

          {isEdit && initial?.created_at && (
            <div className="sm:col-span-2 space-y-0.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <p>
                Recorded {format(new Date(initial.created_at), 'dd MMM yyyy · h:mm a')}
                {initial.created_by_name ? ` · by ${initial.created_by_name}` : ''}
              </p>
              {initial.updated_at && initial.updated_at !== initial.created_at ? (
                <p>
                  Updated {format(new Date(initial.updated_at), 'dd MMM yyyy · h:mm a')}
                  {initial.updated_by_name ? ` · by ${initial.updated_by_name}` : ''}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Record expense'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
