'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Landmark, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createPaymentAccount,
  deletePaymentAccount,
  updatePaymentAccount,
  usePaymentAccounts,
} from '@/hooks/use-payment-accounts'
import type { PaymentAccount, PaymentAccountKind } from '@/lib/payments/payment-accounts'

type Props = {
  canManage: boolean
}

const emptyForm = {
  bank_name: '',
  account_number: '',
  account_name: '',
  kind: 'both' as PaymentAccountKind,
}

export function PaymentAccountsSettingsCard({ canManage }: Props) {
  const { accounts, loading, dbAvailable, reload } = usePaymentAccounts({
    includeInactive: true,
  })
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const startEdit = (a: PaymentAccount) => {
    setEditingId(a.id)
    setForm({
      bank_name: a.bank_name,
      account_number: a.account_number,
      account_name: a.account_name,
      kind: a.kind,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const save = async () => {
    if (!canManage) return
    if (!form.bank_name.trim() || !form.account_number.trim() || !form.account_name.trim()) {
      toast.error('Bank name, account number, and account name are required')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const { error } = await updatePaymentAccount(editingId, form)
        if (error) throw new Error(error)
        toast.success('Account updated')
      } else {
        const { error } = await createPaymentAccount(form)
        if (error) throw new Error(error)
        toast.success('Account added')
      }
      cancelEdit()
      await reload()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const softDelete = async (a: PaymentAccount) => {
    if (!canManage) return
    if (!confirm(`Deactivate “${a.label}”? Past transactions keep the saved label.`)) return
    setSaving(true)
    try {
      const { error } = await updatePaymentAccount(a.id, { is_active: false })
      if (error) {
        // fallback hard delete
        const del = await deletePaymentAccount(a.id)
        if (del.error) throw new Error(del.error)
      }
      toast.success('Account removed')
      await reload()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5" />
          Payment accounts
          {!canManage && (
            <Badge variant="outline" className="ml-auto">
              View only
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Bank / POS destinations for POS and Transfer payments (e.g. Ecobank 02489374033 Hotel
          Limited). Staff must pick one when collecting POS or Transfer so owners can see where
          money was deposited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!dbAvailable && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
            Database table missing. Run <code className="text-xs">scripts/076_payment_accounts.sql</code>{' '}
            in the Supabase SQL Editor (staging first, then prod after deploy).
          </p>
        )}

        {canManage && dbAvailable && (
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">
              {editingId ? 'Edit account' : 'Add account'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bank name</Label>
                <Input
                  value={form.bank_name}
                  onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                  placeholder="Ecobank"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input
                  value={form.account_number}
                  onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                  placeholder="02489374033"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account name</Label>
                <Input
                  value={form.account_name}
                  onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                  placeholder="Hotel Limited"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Use for</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, kind: v as PaymentAccountKind }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">POS &amp; Transfer</SelectItem>
                    <SelectItem value="pos">POS only</SelectItem>
                    <SelectItem value="transfer">Transfer only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                {editingId ? 'Save changes' : 'Add account'}
              </Button>
              {editingId && (
                <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Use for</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 4 : 3}
                      className="text-center text-muted-foreground py-8"
                    >
                      No payment accounts yet
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((a) => (
                    <TableRow key={a.id} className={!a.is_active ? 'opacity-60' : undefined}>
                      <TableCell>
                        <div className="font-medium text-sm">{a.label}</div>
                        <div className="text-xs text-muted-foreground md:hidden capitalize">
                          {a.kind} · {a.is_active ? 'active' : 'inactive'}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize hidden sm:table-cell">{a.kind}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={a.is_active ? 'default' : 'outline'}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => startEdit(a)}
                              disabled={!a.is_active}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => void softDelete(a)}
                              disabled={!a.is_active || saving}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
