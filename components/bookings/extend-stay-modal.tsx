'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { CreditCard, ChevronRight, Check } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface ExtendStayModalProps {
  open: boolean
  onClose: () => void
  booking: {
    id: string
    folioId: string
    guestName: string
    room: string
    currentCheckOut: string
    ratePerNight: number
    guestId: string
    guestBalance?: number
  }
}

export function ExtendStayModal({ open, onClose, booking }: ExtendStayModalProps) {
  const [step, setStep] = useState(1)
  const [newCheckOutDate, setNewCheckOutDate] = useState<Date | undefined>()
  const [paymentMethod, setPaymentMethod] = useState('')
  const [loading, setLoading] = useState(false)
  const [ledgerType, setLedgerType] = useState('individual')
  const [showOrgSearch, setShowOrgSearch] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  const [organizations, setOrganizations] = useState<any[]>([])
  const [filteredOrganizations, setFilteredOrganizations] = useState<any[]>([])
  const [orgSearchTerm, setOrgSearchTerm] = useState('')

  // When modal opens with city_ledger, auto-select the current guest
  useEffect(() => {
    if (open && paymentMethod === 'city_ledger') {
      if (ledgerType === 'individual' && booking.guestId && !selectedLedger) {
        // Auto-select current guest for city ledger individual
        setSelectedLedger({ id: booking.guestId, name: booking.guestName })
      } else if (ledgerType === 'organization') {
        fetchOrganizations()
      }
    }
  }, [open, paymentMethod, ledgerType, booking, selectedLedger])

  const fetchOrganizations = async () => {
    try {
      const supabase = createClient()
      // Fetch from city_ledger_accounts for organizations (exclude individuals)
      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, balance')
        .neq('account_type', 'individual')
        .neq('account_type', 'guest')
        .order('account_name')

      if (error) throw error
      setOrganizations((data || []).map(d => ({ id: d.id, name: d.account_name, current_balance: d.balance || 0 })))
      setFilteredOrganizations((data || []).map(d => ({ id: d.id, name: d.account_name, current_balance: d.balance || 0 })))
    } catch (error: any) {
      toast.error('Failed to load organizations')
    }
  }

  const handleOrgSearch = (value: string) => {
    setOrgSearchTerm(value)
    if (value.trim()) {
      const filtered = organizations.filter(org =>
        org.name.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredOrganizations(filtered)
    } else {
      setFilteredOrganizations(organizations)
    }
  }

  // Normalize to midnight local time to avoid timezone-offset arithmetic issues
  const currentCheckOut = (() => {
    const d = new Date(booking.currentCheckOut)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })()
  const additionalNights = newCheckOutDate ? differenceInDays(newCheckOutDate, currentCheckOut) : 0
  const additionalAmount = additionalNights * booking.ratePerNight

  const handleExtend = async () => {
    if (!newCheckOutDate || !paymentMethod) {
      toast.error('Please complete all fields')
      return
    }

    if (!booking.id) {
      toast.error('Booking ID is missing. Please close and reopen this dialog.')
      return
    }

    if (paymentMethod === 'city_ledger' && !selectedLedger) {
      toast.error('Please select an account for City Ledger')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      
      // Add charge to folio_charges with unpaid status
      // Note: organization_id column may not exist yet, so we try with it first, then fall back without it
      const chargeData: any = {
        booking_id: booking.id,
        description: `Extended Stay - ${additionalNights} night${additionalNights !== 1 ? 's' : ''}`,
        amount: additionalAmount,
        charge_type: 'extended_stay',
        payment_method: paymentMethod,
        ledger_account_id: paymentMethod === 'city_ledger' ? selectedLedger?.id : null,
        ledger_account_type: paymentMethod === 'city_ledger' ? ledgerType : null,
        payment_status: 'unpaid',
        created_by: booking.created_by
      }
      
      // Try to include organization_id if column exists
      if (booking.organization_id) {
        chargeData.organization_id = booking.organization_id
      }
      
      const { error: chargeError } = await supabase
        .from('folio_charges')
        .insert([chargeData])

      if (chargeError) {
        // If error includes "organization_id", try again without it
        if (chargeError.message?.includes('organization_id')) {
          const fallbackData = { ...chargeData }
          delete fallbackData.organization_id
          const { error: retryError } = await supabase
            .from('folio_charges')
            .insert([fallbackData])
          if (retryError) throw retryError
        } else {
          throw chargeError
        }
      }

      // Update booking checkout date
      await supabase
        .from('bookings')
        .update({ check_out: format(newCheckOutDate, 'yyyy-MM-dd') })
        .eq('id', booking.id)

      // Bump booking balance for unpaid / city-ledger extended stay
      if (paymentMethod !== 'cash' && paymentMethod !== 'card' && paymentMethod !== 'pos' && paymentMethod !== 'bank_transfer') {
        const { data: freshBk } = await supabase
          .from('bookings')
          .select('balance')
          .eq('id', booking.id)
          .single()
        await supabase
          .from('bookings')
          .update({ balance: (freshBk?.balance || 0) + additionalAmount, payment_status: 'pending' })
          .eq('id', booking.id)
      }

      // Write to transactions table (non-fatal)
      try {
        await supabase.from('transactions').insert([{
          organization_id: booking.organization_id || null,
          booking_id: booking.id,
          transaction_id: `EXT-${booking.id}-${Date.now()}`,
          guest_name: booking.guestName || 'Guest',
          room: booking.room || null,
          amount: additionalAmount,
          payment_method: paymentMethod,
          status: paymentMethod === 'city_ledger' ? 'pending' : 'paid',
          description: `Extended Stay — ${additionalNights} night${additionalNights !== 1 ? 's' : ''}`,
          received_by: null,
        }])
      } catch (_) { /* non-fatal */ }

      const accountInfo = paymentMethod === 'city_ledger' && selectedLedger 
        ? ` to ${selectedLedger.name}`
        : ''
      
      toast.success(`Stay extended to ${format(newCheckOutDate, 'PPP')}${accountInfo}`)
      onClose()
      resetForm()
    } catch (error: any) {
      toast.error(error.message || 'Failed to extend stay')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setNewCheckOutDate(undefined)
    setPaymentMethod('')
    setLedgerType('individual')
    setShowOrgSearch(false)
    setSelectedLedger(null)
    setOrgSearchTerm('')
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
          <DialogTitle>Extend Stay - {booking.folioId}</DialogTitle>
          <DialogDescription className="sr-only">Extend guest stay wizard</DialogDescription>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Badge variant={step === 1 ? 'default' : 'secondary'}>1. New Checkout Date</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={step === 2 ? 'default' : 'secondary'}>2. Payment</Badge>
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Checkout:</span>
              <span className="font-medium">{format(currentCheckOut, 'PPP')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate/Night:</span>
              <span className="font-medium">{formatNaira(booking.ratePerNight)}</span>
            </div>
          </div>

          {/* Step 1: Select New Checkout Date */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New Checkout Date *</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={newCheckOutDate}
                    onSelect={setNewCheckOutDate}
                    disabled={(date) => date < currentCheckOut}
                    className="rounded-md border"
                  />
                </div>
              </div>

              {newCheckOutDate && additionalNights > 0 && (
                <div className="p-4 bg-primary/5 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Additional Nights:</span>
                    <span className="font-semibold">{additionalNights} night{additionalNights !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold">
                    <span>Additional Amount:</span>
                    <span className="text-primary">{formatNaira(additionalAmount)}</span>
                  </div>
                </div>
              )}

              <Button
                onClick={() => setStep(2)}
                className="w-full"
                disabled={!newCheckOutDate || additionalNights <= 0}
              >
                Continue to Payment
              </Button>
            </div>
          )}

          {/* Step 2: Payment Method */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>New Checkout Date:</span>
                  <span className="font-semibold">{newCheckOutDate && format(newCheckOutDate, 'PPP')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Additional Nights:</span>
                  <span className="font-semibold">{additionalNights}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total Amount:</span>
                  <span className="text-primary">{formatNaira(additionalAmount)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method *</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {['cash', 'pos', 'transfer', 'city_ledger'].map((method) => (
                    <Button
                      key={method}
                      variant={paymentMethod === method ? 'default' : 'outline'}
                      onClick={() => {
                        setPaymentMethod(method)
                        if (method !== 'city_ledger') {
                          setShowOrgSearch(false)
                          setSelectedLedger(null)
                        }
                      }}
                    >
                      {method.replace('_', ' ').toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'city_ledger' && (
                <div className="space-y-3">
                  {/* Ledger Type Selector */}
                  <div className="space-y-2">
                    <Label>Bill to Account Type *</Label>
                    <Select value={ledgerType} onValueChange={setLedgerType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual (Guest)</SelectItem>
                        <SelectItem value="organization">Organization</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Individual Guest Account */}
                  {ledgerType === 'individual' && (
                    <Card className="bg-muted">
                      <CardContent className="p-3">
                        <button
                          onClick={() => setSelectedLedger({ id: booking.guestId, name: booking.guestName, balance: booking.guestBalance || 0 })}
                          className="w-full text-left hover:opacity-80 transition-opacity"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium">{booking.guestName}</div>
                              <div className="text-sm text-muted-foreground">
                                Balance: {formatNaira(booking.guestBalance || 0)}
                              </div>
                            </div>
                            {selectedLedger?.id === booking.guestId && (
                              <Badge variant="default">Selected</Badge>
                            )}
                            {!selectedLedger && (
                              <Badge variant="secondary">Click to Select</Badge>
                            )}
                          </div>
                        </button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Organization Search */}
                  {ledgerType === 'organization' && (
                    <div className="space-y-2">
                      <Label>Search Organization</Label>
                      <div className="space-y-2">
                        <div className="relative">
                          <Input
                            placeholder="Search organization by name..."
                            value={orgSearchTerm || ''}
                            onChange={(e) => handleOrgSearch(e.target.value)}
                            className="rounded-md border px-3 py-2"
                          />
                        </div>

                        {orgSearchTerm && filteredOrganizations.length > 0 && (
                          <div className="border rounded-md max-h-64 overflow-y-auto">
                            {filteredOrganizations.map((org) => (
                              <button
                                key={org.id}
                                onClick={() => {
                                  setSelectedLedger(org)
                                  setOrgSearchTerm('')
                                  setFilteredOrganizations([])
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 transition-colors flex items-center justify-between"
                              >
                                <div>
                                  <div className="font-medium text-sm">{org.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Balance: {formatNaira(org.current_balance || 0)}
                                  </div>
                                </div>
                                {selectedLedger?.id === org.id && (
                                  <Check className="h-4 w-4 text-green-600" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {orgSearchTerm && filteredOrganizations.length === 0 && (
                          <div className="text-sm text-muted-foreground p-3 border rounded-md text-center">
                            No organizations found
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Selected Organization Display */}
                  {selectedLedger && ledgerType === 'organization' && (
                    <Card className="mt-2 bg-primary/10 border-primary">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">{selectedLedger.name}</div>
                            <div className="text-sm text-muted-foreground">
                              Balance: {formatNaira(selectedLedger.current_balance || 0)}
                            </div>
                          </div>
                          <Badge variant="default">Selected</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button 
                  onClick={handleExtend} 
                  className="flex-1"
                  disabled={!paymentMethod || loading}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {loading ? 'Processing...' : 'Confirm Extension'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
