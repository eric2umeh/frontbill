'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
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
import { recordGuestLedgerCashMovement } from '@/lib/utils/guest-city-ledger'
import { toast } from 'sonner'
import { TrendingDown, TrendingUp, Loader2 } from 'lucide-react'

interface CityLedgerPaymentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** "guest" or "organization" */
  accountType: 'guest' | 'organization'
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
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const amountNum = parseFloat(amount) || 0

  const newBalanceAfterPayment = currentBalance - amountNum

  const handleSubmit = async () => {
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (!paymentMethod) {
      toast.error('Please select a payment method')
      return
    }

    try {
      setLoading(true)
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Session expired'); return }

      const isTopUp = tab === 'topup'
      const newBalance = currentBalance - amountNum
      const transactionType = isTopUp ? 'City Ledger Top-Up' : 'City Ledger Settlement'

      if (accountType === 'guest') {
        await recordGuestLedgerCashMovement(supabase, {
          organizationId,
          accountName,
          guestId: guestId ?? null,
          amount: amountNum,
          paymentMethod,
          notes,
          transactionType,
          userId: user.id,
          ledgerAccountId,
          currentLedgerBalance: currentBalance,
          syncGuestProfile: true,
        })
      } else {
        // Organization (or non-guest): city ledger row is required for update path
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

        const txId = `CLG-${Date.now()}`
        const { error: txError } = await supabase.from('transactions').insert([{
          organization_id: organizationId,
          booking_id: null,
          transaction_id: txId,
          guest_name: accountName,
          room: null,
          amount: amountNum,
          payment_method: paymentMethod,
          status: 'paid',
          description: `${transactionType} — ${accountName}${notes ? ` | ${notes}` : ''}`,
          received_by: user.id,
        }])
        if (txError) console.warn('Transaction insert:', txError.message)
      }

      toast.success(
        isTopUp
          ? `Credit of ${formatNaira(amountNum)} added to ${accountName}'s account`
          : `Payment of ${formatNaira(amountNum)} recorded for ${accountName}`
      )
      setAmount('')
      setPaymentMethod('')
      setNotes('')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to process payment')
    } finally {
      setLoading(false)
    }
  }

  const balanceLabel = () => {
    if (currentBalance > 0) return { text: `Owes ${formatNaira(currentBalance)}`, color: 'text-red-600', variant: 'destructive' as const }
    if (currentBalance < 0) return { text: `Credit ${formatNaira(Math.abs(currentBalance))}`, color: 'text-green-600', variant: 'default' as const }
    return { text: 'Settled', color: 'text-muted-foreground', variant: 'secondary' as const }
  }

  const bl = balanceLabel()

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>City Ledger Account</DialogTitle>
          <DialogDescription>
            Manage the city ledger balance for <span className="font-semibold">{accountName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Current balance banner */}
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
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="pos">POS / Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="online">Online Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
              Add credit to <span className="font-medium">{accountName}</span>'s account to use against future charges.
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
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="pos">POS / Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="online">Online Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || !amountNum || !paymentMethod}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tab === 'settle' ? 'Record Payment' : 'Add Credit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
