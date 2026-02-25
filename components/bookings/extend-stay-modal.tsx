'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { CalendarIcon, CreditCard, ChevronRight, Search, Check } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface ExtendStayModalProps {
  open: boolean
  onClose: () => void
  booking: {
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

  useEffect(() => {
    if (open && paymentMethod === 'city_ledger') {
      fetchOrganizations()
    }
  }, [open, paymentMethod])

  const fetchOrganizations = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, current_balance')
        .order('name')

      if (error) throw error
      setOrganizations(data || [])
      setFilteredOrganizations(data || [])
    } catch (error: any) {
      console.error('[v0] Error fetching organizations:', error)
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

  const currentCheckOut = new Date(booking.currentCheckOut)
  const additionalNights = newCheckOutDate ? differenceInDays(newCheckOutDate, currentCheckOut) : 0
  const additionalAmount = additionalNights * booking.ratePerNight

  const handleExtend = async () => {
    if (!newCheckOutDate || !paymentMethod) {
      toast.error('Please complete all fields')
      return
    }

    if (paymentMethod === 'city_ledger' && !selectedLedger) {
      toast.error('Please select an account for City Ledger')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      
      // Add charge to folio_charges
      const chargeData = {
        booking_id: booking.guestId, // This should be the booking ID, not guest ID
        description: `Extended Stay - ${additionalNights} night${additionalNights !== 1 ? 's' : ''}`,
        amount: additionalAmount,
        charge_type: 'extended_stay',
        payment_method: paymentMethod,
        ledger_account_id: paymentMethod === 'city_ledger' ? selectedLedger.id : null,
        ledger_account_type: paymentMethod === 'city_ledger' ? ledgerType : null,
        payment_status: paymentMethod === 'city_ledger' ? 'pending' : 'paid',
      }

      const { error: chargeError } = await supabase
        .from('folio_charges')
        .insert([chargeData])

      if (chargeError) throw chargeError

      // Update ledger balance if city ledger
      if (paymentMethod === 'city_ledger') {
        if (ledgerType === 'individual') {
          await supabase
            .from('guests')
            .update({ balance: (selectedLedger.balance || 0) + additionalAmount })
            .eq('id', selectedLedger.id)
        } else {
          await supabase
            .from('organizations')
            .update({ current_balance: (selectedLedger.current_balance || 0) + additionalAmount })
            .eq('id', selectedLedger.id)
        }
      }

      const accountInfo = paymentMethod === 'city_ledger' && selectedLedger 
        ? ` to ${selectedLedger.name}`
        : ''
      
      toast.success(`Stay extended to ${format(newCheckOutDate, 'PPP')}${accountInfo}`)
      onClose()
      resetForm()
    } catch (error: any) {
      console.error('[v0] Error extending stay:', error)
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
          <DialogDescription>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={step === 1 ? 'default' : 'secondary'}>1. New Checkout Date</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant={step === 2 ? 'default' : 'secondary'}>2. Payment</Badge>
            </div>
          </DialogDescription>
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
                          setSelectedOrganization(null)
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
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">{booking.guestName}</div>
                            <div className="text-sm text-muted-foreground">
                              Balance: {formatNaira(booking.guestBalance || 0)}
                            </div>
                          </div>
                          <Badge variant="default">Current Guest</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Organization Search */}
                  {ledgerType === 'organization' && (
                    <div className="space-y-2">
                      <Label>Search Organization</Label>
                      <div className="space-y-2">
                        <div className="relative">
                          <CommandInput
                            placeholder="Search organization by name..."
                            value={orgSearchTerm}
                            onValueChange={handleOrgSearch}
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
