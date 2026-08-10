'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogScrollableBody,
  DialogScrollableFooter,
  DialogScrollableHeader,
  dialogScrollableContentClass,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { TrendingDown, TrendingUp, Loader2 } from 'lucide-react'
import { PaymentAccountSelect } from '@/components/payments/payment-account-select'
import {
  appendAccountToNotes,
  paymentAccountInsertFields,
  paymentMethodRequiresAccount,
  type PaymentAccount,
} from '@/lib/payments/payment-accounts'
import { useClickLock } from '@/hooks/use-click-lock'
import { cn } from '@/lib/utils'

interface CityLedgerPaymentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** Guest profile vs city ledger account kind (individual is non-org ledger, no org.current_balance sync) */
  accountType: 'guest' | 'organization' | 'individual'
  /** Display name used to look up city_ledger_accounts.account_name */
  accountName: string
  /** city_ledger_accounts.id (null if no ledger account exists yet) */
  ledgerAccountId: string | null
  /** Current balance on the city ledger account (positive = owes hotel / debit) */
  currentBalance: number
  /** Hotel organization_id (for scoping queries + transaction insert) */
  organizationId: string
  /** organizations.id — only provided when accountType === "organization" */
  orgId?: string
  /** guests.id — only provided when accountType === "guest" */
  guestId?: string
}

export default function CityLedgerPaymentModal({
  open,
  onClose,
  onSuccess,
  accountType,
  accountName,
  ledgerAccountId,
  currentBalance,
  organizationId,
  orgId,
  guestId,
}: CityLedgerPaymentModalProps) {
  const [tab, setTab] = useState<'settle' | 'topup'>('settle')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [paymentAccount, setPaymentAccount] = useState<PaymentAccount | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const { locked, run: runLocked } = useClickLock(1200)

  const amountNum = parseFloat(amount) || 0
  const busy = loading || locked

  const newBalanceAfterPayment = currentBalance - amountNum

  const handleSubmit = () =>
    runLocked(async () => {
      if (!amountNum || amountNum <= 0) {
        toast.error('Please enter a valid amount')
        return
      }
      if (!paymentMethod) {
        toast.error('Please select a payment method')
        return
      }
      if (paymentMethodRequiresAccount(paymentMethod) && !paymentAccountId) {
        toast.error('Select the POS / bank account where this payment was received')
        return
      }

      try {
        setLoading(true)
        const supabase = createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          toast.error('Session expired')
          return
        }

        const isTopUp = tab === 'topup'
        const newBalance = currentBalance - amountNum
        const transactionType = isTopUp ? 'City Ledger Top-Up' : 'City Ledger Settlement'
        const accountFields = paymentMethodRequiresAccount(paymentMethod)
          ? paymentAccountInsertFields(paymentAccount)
          : { payment_account_id: null, payment_account_label: null }

        if (accountType === 'guest') {
          if (!guestId) {
            toast.error('Guest profile is missing')
            return
          }
          const res = await fetch(`/api/guests/${guestId}/ledger-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caller_id: user.id,
              amount: amountNum,
              payment_method: paymentMethod,
              notes,
              transaction_type: transactionType,
              ledger_account_id: ledgerAccountId,
              current_ledger_balance: currentBalance,
              ...accountFields,
            }),
          })
          const payload = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(payload?.error || 'Failed to process payment')
          }
          // Only settle expects folio debt to clear; Add Credit may leave credit while rooms continue.
          if (
            !isTopUp &&
            typeof payload?.folio_after === 'number' &&
            payload.folio_after > 0.005 &&
            amountNum + 0.005 < Number(payload?.folio_before ?? 0)
          ) {
            toast.success(
              `Partial payment recorded. ₦${payload.folio_after.toLocaleString()} still outstanding.`,
            )
            setAmount('')
            setPaymentMethod('')
            setPaymentAccountId('')
            setPaymentAccount(null)
            setNotes('')
            onSuccess()
            onClose()
            return
          }
        } else {
          if (ledgerAccountId) {
            const { error } = await supabase
              .from('city_ledger_accounts')
              .update({
                balance: newBalance,
                updated_at: new Date().toISOString(),
              })
              .eq('id', ledgerAccountId)
            if (error) throw new Error(`Ledger update failed: ${error.message}`)
          }

          if (accountType === 'organization' && orgId) {
            const { error } = await supabase
              .from('organizations')
              .update({ current_balance: newBalance })
              .eq('id', orgId)
            if (error) console.warn('Org balance update:', error.message)
          }

          const txId = `CLG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const { error: txError } = await supabase.from('transactions').insert([{
            organization_id: organizationId,
            booking_id: null,
            transaction_id: txId,
            guest_name: accountName,
            room: null,
            amount: amountNum,
            payment_method: paymentMethod,
            status: 'paid',
            description: appendAccountToNotes(
              `${transactionType} — ${accountName}${notes ? ` | ${notes}` : ''}`,
              accountFields.payment_account_label,
            ),
            received_by: user.id,
            ...accountFields,
          }])
          if (txError) console.warn('Transaction insert:', txError.message)
        }

        toast.success(
          isTopUp
            ? `Credit of ${formatNaira(amountNum)} added to ${accountName}'s account`
            : `Payment of ${formatNaira(amountNum)} recorded for ${accountName}`,
        )
        setAmount('')
        setPaymentMethod('')
        setPaymentAccountId('')
        setPaymentAccount(null)
        setNotes('')
        onSuccess()
        onClose()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to process payment'
        toast.error(message)
      } finally {
        setLoading(false)
      }
    })

  const balanceLabel = () => {
    if (currentBalance > 0) return { text: `Owes ${formatNaira(currentBalance)}`, color: 'text-red-600', variant: 'destructive' as const }
    if (currentBalance < 0) return { text: `Credit ${formatNaira(Math.abs(currentBalance))}`, color: 'text-green-600', variant: 'default' as const }
    return { text: 'Settled', color: 'text-muted-foreground', variant: 'secondary' as const }
  }

  const bl = balanceLabel()

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className={cn(dialogScrollableContentClass, 'sm:max-w-md')}>
        <DialogScrollableHeader>
          <DialogTitle>City Ledger Account</DialogTitle>
          <DialogDescription>
            Manage the city ledger balance for <span className="font-semibold">{accountName}</span>
          </DialogDescription>
        </DialogScrollableHeader>

        <DialogScrollableBody className="space-y-4">
          <div className={`rounded-lg border p-4 flex items-center justify-between ${currentBalance > 0 ? 'border-red-200 bg-red-50' : currentBalance < 0 ? 'border-green-200 bg-green-50' : 'border-border bg-muted/40'}`}>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Balance</p>
              <p className={`text-2xl font-bold mt-0.5 ${bl.color}`}>{formatNaira(Math.abs(currentBalance))}</p>
              {currentBalance !== 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentBalance > 0 ? 'Debit — amount owed to hotel' : 'Credit — amount in favour of account'}
                </p>
              )}
            </div>
            <Badge variant={bl.variant} className="text-xs">{bl.text}</Badge>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'settle' | 'topup')}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="settle" className="gap-2">
                <TrendingDown className="h-3.5 w-3.5" />
                Settle / Pay Debt
              </TabsTrigger>
              <TabsTrigger value="topup" className="gap-2">
                <TrendingUp className="h-3.5 w-3.5" />
                Add Credit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settle" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Record a payment from <span className="font-medium">{accountName}</span> to reduce their outstanding debt.
                Paying more than the debt leaves prepaid credit.
              </p>

              <div className="space-y-1">
                <Label>Amount (NGN)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => {
                    setPaymentMethod(v)
                    setPaymentAccountId('')
                    setPaymentAccount(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <PaymentAccountSelect
                paymentMethod={paymentMethod}
                value={paymentAccountId}
                onChange={(id, acc) => {
                  setPaymentAccountId(id)
                  setPaymentAccount(acc)
                }}
              />

              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea placeholder="Reference or remarks" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              {amountNum > 0 && (
                <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Current balance</span>
                    <span className={currentBalance > 0 ? 'text-red-600' : 'text-green-600'}>{formatNaira(currentBalance)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Payment</span>
                    <span className="text-green-600">- {formatNaira(amountNum)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>New balance</span>
                    <span className={newBalanceAfterPayment > 0 ? 'text-red-600' : newBalanceAfterPayment < 0 ? 'text-green-600' : ''}>
                      {formatNaira(newBalanceAfterPayment)}
                    </span>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="topup" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Add cash to <span className="font-medium">{accountName}</span>&apos;s account.
                Outstanding room debt is cleared first; any leftover becomes prepaid credit.
              </p>

              <div className="space-y-1">
                <Label>Credit Amount (NGN)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Enter credit amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => {
                    setPaymentMethod(v)
                    setPaymentAccountId('')
                    setPaymentAccount(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <PaymentAccountSelect
                paymentMethod={paymentMethod}
                value={paymentAccountId}
                onChange={(id, acc) => {
                  setPaymentAccountId(id)
                  setPaymentAccount(acc)
                }}
              />

              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea placeholder="Reference or remarks" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              {amountNum > 0 && (
                <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Current balance</span>
                    <span className={currentBalance > 0 ? 'text-red-600' : 'text-green-600'}>{formatNaira(currentBalance)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Credit added</span>
                    <span className="text-blue-600">− {formatNaira(amountNum)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>New balance</span>
                    <span className={newBalanceAfterPayment > 0 ? 'text-red-600' : newBalanceAfterPayment < 0 ? 'text-green-600' : ''}>
                      {formatNaira(newBalanceAfterPayment)}
                    </span>
                  </div>
                  {currentBalance > 0 && amountNum > currentBalance && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Clears {formatNaira(currentBalance)} debt; {formatNaira(amountNum - currentBalance)} remains as credit.
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogScrollableBody>

        <DialogScrollableFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={busy || !amountNum || !paymentMethod}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tab === 'settle' ? 'Record Payment' : 'Add Credit'}
          </Button>
        </DialogScrollableFooter>
      </DialogContent>
    </Dialog>
  )
}
