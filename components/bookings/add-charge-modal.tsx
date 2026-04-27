'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { CreditCard, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { isSelectableLedgerName } from '@/lib/utils/ledger-organization'

interface AddChargeModalProps {
  open: boolean
  onClose: () => void
  booking: {
    id: string
    folioId: string
    guestName: string
    guestId: string
    room: string
    organization_id?: string
    created_by?: string
  }
}

export function AddChargeModal({ open, onClose, booking }: AddChargeModalProps) {
  const [step, setStep] = useState(1)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('city_ledger')
  const [loading, setLoading] = useState(false)
  const [ledgerType, setLedgerType] = useState('individual')
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  const [organizations, setOrganizations] = useState<any[]>([])

  // When modal opens with city_ledger, auto-select the current guest
  useEffect(() => {
    if (open && paymentMethod === 'city_ledger') {
      if (ledgerType === 'individual' && booking.guestId && !selectedLedger) {
        setSelectedLedger({ id: booking.guestId, name: booking.guestName })
      } else if (ledgerType === 'organization') {
        fetchOrganizations()
      }
    }
  }, [open, paymentMethod, ledgerType, booking, selectedLedger])

  const fetchOrganizations = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, balance')
        .eq('organization_id', booking.organization_id!)
        .order('account_name')

      if (error) throw error
      setOrganizations((data || [])
        .filter((d: any) => isSelectableLedgerName(d.account_name))
        .map((d: any) => ({ id: d.id, name: d.account_name, balance: d.balance })))
    } catch (error: any) {
      toast.error('Failed to load accounts')
    }
  }

  const handleAddCharge = async () => {
    if (!description.trim() || !amount) {
      toast.error('Please fill in all fields')
      return
    }

    const chargeAmount = parseFloat(amount)
    if (chargeAmount <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }

    if (paymentMethod === 'city_ledger' && !selectedLedger) {
      toast.error('Please select an account for City Ledger')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData.user?.id || booking.created_by || null
      // Cash, POS, card, transfer, cheque = paid immediately
      // city_ledger = deferred (pending)
      const isPaidNow = paymentMethod !== 'city_ledger' && paymentMethod !== 'deferred'

      // Build folio_charges insert — without organization_id (column may not exist)
      const chargeData: any = {
        booking_id: booking.id,
        description: description,
        amount: chargeAmount,
        charge_type: 'additional_charge',
        payment_method: isPaidNow ? paymentMethod : null,
        payment_status: isPaidNow ? 'paid' : 'pending',
        created_by: booking.created_by || null,
      }

      const { error: chargeError } = await supabase
        .from('folio_charges')
        .insert([chargeData])

      if (chargeError) throw chargeError

      // For unpaid / city-ledger charges: bump the booking's balance
      if (!isPaidNow) {
        const { data: bk } = await supabase
          .from('bookings')
          .select('balance, payment_status')
          .eq('id', booking.id)
          .single()
        const newBalance = (bk?.balance || 0) + chargeAmount
        await supabase
          .from('bookings')
          .update({ balance: newBalance, payment_status: 'pending' })
          .eq('id', booking.id)
      }

      // Write to transactions table with correct schema columns
      // Errors here are non-fatal — we swallow them so the charge still saves
      try {
        await supabase.from('transactions').insert([{
          organization_id: booking.organization_id || null,
          booking_id: booking.id,
          transaction_id: `CHG-${booking.id}-${Date.now()}`,
          guest_name: booking.guestName || 'Guest',
          room: booking.room || null,
          amount: chargeAmount,
          payment_method: paymentMethod,
          status: isPaidNow ? 'paid' : 'pending',
          description: description,
          received_by: currentUserId,
        }])
      } catch (_) { /* non-fatal */ }

      // If city ledger: bump guest/org balance AND city_ledger_accounts balance
      if (paymentMethod === 'city_ledger') {
        // Always bump guests.balance for the booking's guest
        if (booking.guestId) {
          const { data: guestRow } = await supabase
            .from('guests')
            .select('balance, name')
            .eq('id', booking.guestId)
            .single()
          if (guestRow) {
            await supabase
              .from('guests')
              .update({ balance: ((guestRow.balance as number) || 0) + chargeAmount })
              .eq('id', booking.guestId)

            // If no city_ledger_account was selected, create one for this guest
            if (!selectedLedger?.id && guestRow.name) {
              // Check if account already exists
              const { data: existingAcct } = await supabase
                .from('city_ledger_accounts')
                .select('id, balance')
                .eq('organization_id', booking.organization_id)
                .ilike('account_name', guestRow.name)
                .maybeSingle()

              if (existingAcct) {
                // Update existing
                await supabase
                  .from('city_ledger_accounts')
                  .update({ balance: (existingAcct.balance || 0) + chargeAmount })
                  .eq('id', existingAcct.id)
              } else {
                // Create new city_ledger_account for this guest
                await supabase.from('city_ledger_accounts').insert([{
                  organization_id: booking.organization_id,
                  account_name: guestRow.name,
                  account_type: 'individual',
                  balance: chargeAmount,
                }])
              }
            }
          }
        }

        // If a specific ledger account was selected, update it
        if (selectedLedger?.id) {
          const { data: acct } = await supabase
            .from('city_ledger_accounts')
            .select('balance')
            .eq('id', selectedLedger.id)
            .single()
          await supabase
            .from('city_ledger_accounts')
            .update({ balance: (acct?.balance || 0) + chargeAmount })
            .eq('id', selectedLedger.id)

          // If it's an organization ledger, also bump organizations.current_balance
          if (ledgerType === 'organization') {
            const { data: orgRow } = await supabase
              .from('organizations')
              .select('current_balance')
              .eq('id', selectedLedger.id)
              .single()
            if (orgRow) {
              await supabase
                .from('organizations')
                .update({ current_balance: ((orgRow.current_balance as number) || 0) + chargeAmount })
                .eq('id', selectedLedger.id)
            }
          }
        }
      }

      toast.success(`Charge of ${formatNaira(chargeAmount)} added${isPaidNow ? ' (paid)' : ' — added to Bill Balance'}`)
      onClose()
      resetForm()
    } catch (error: any) {
      toast.error(error.message || 'Failed to add charge')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setDescription('')
    setAmount('')
    setPaymentMethod('city_ledger')
    setLedgerType('individual')
    setSelectedLedger(null)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        onClose()
        resetForm()
      }
    }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Charge - {booking.folioId}</DialogTitle>
          <DialogDescription className="sr-only">Add miscellaneous charge to booking</DialogDescription>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Badge variant={step === 1 ? 'default' : 'secondary'}>1. Charge Details</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={step === 2 ? 'default' : 'secondary'}>2. Payment Method</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Guest Info Summary */}
          <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Guest:</span>
              <span className="font-medium">{booking.guestName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Room:</span>
              <span className="font-medium">{booking.room}</span>
            </div>
          </div>

          {/* Step 1: Charge Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="description">Charge Description</Label>
                <Textarea
                  id="description"
                  placeholder="e.g., Extra bed, Late checkout, Minibar, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-2 min-h-20"
                />
              </div>

              <div>
                <Label htmlFor="amount">Amount (₦)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="mt-2"
                />
              </div>

              <Button onClick={() => setStep(2)} className="w-full">
                Continue to Payment Method
              </Button>
            </div>
          )}

          {/* Step 2: Payment Method */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="city_ledger">City Ledger</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'city_ledger' && (
                <>
                  <div>
                    <Label>Account Type</Label>
                    <Select value={ledgerType} onValueChange={setLedgerType}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual (Guest)</SelectItem>
                        <SelectItem value="organization">Organization</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {ledgerType === 'individual' && (
                    <Card>
                      <CardContent className="p-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Selected Account:</span>
                          <span className="font-medium">{selectedLedger?.name || booking.guestName}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {ledgerType === 'organization' && (
                    <div>
                      <Label>Select Organization</Label>
                      <Select value={selectedLedger?.id || ''} onValueChange={(id) => {
                        const org = organizations.find(o => o.id === id)
                        setSelectedLedger(org)
                      }}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Choose organization..." />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations.map(org => (
                            <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              <div className="p-3 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Charge Amount:</span>
                  <span className="text-lg font-bold">{formatNaira(parseFloat(amount) || 0)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button 
                  onClick={handleAddCharge} 
                  disabled={loading || !amount}
                  className="flex-1"
                >
                  {loading ? 'Adding...' : 'Add Charge'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
