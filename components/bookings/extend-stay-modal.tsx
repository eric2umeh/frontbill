'use client'

import { useState } from 'react'
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

// Mock organizations
const mockOrganizations = [
  { id: '1', name: 'Hilton Hotels', balance: 5000000 },
  { id: '2', name: 'Marriott International', balance: 3500000 },
  { id: '3', name: 'Accor Hotels', balance: 2800000 },
  { id: '4', name: 'IHG Hotels', balance: 1900000 },
]

interface ExtendStayModalProps {
  open: boolean
  onClose: () => void
  booking: {
    folioId: string
    guestName: string
    room: string
    currentCheckOut: string
    ratePerNight: number
  }
}

export function ExtendStayModal({ open, onClose, booking }: ExtendStayModalProps) {
  const [step, setStep] = useState(1)
  const [newCheckOutDate, setNewCheckOutDate] = useState<Date | undefined>()
  const [paymentMethod, setPaymentMethod] = useState('')
  const [loading, setLoading] = useState(false)
  const [showOrgSearch, setShowOrgSearch] = useState(false)
  const [selectedOrganization, setSelectedOrganization] = useState<typeof mockOrganizations[0] | null>(null)

  const currentCheckOut = new Date(booking.currentCheckOut)
  const additionalNights = newCheckOutDate ? differenceInDays(newCheckOutDate, currentCheckOut) : 0
  const additionalAmount = additionalNights * booking.ratePerNight

  const handleExtend = async () => {
    if (!newCheckOutDate || !paymentMethod) {
      toast.error('Please complete all fields')
      return
    }

    if (paymentMethod === 'city_ledger' && !selectedOrganization) {
      toast.error('Please select an account for City Ledger')
      return
    }

    setLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const accountInfo = paymentMethod === 'city_ledger' && selectedOrganization 
        ? ` to ${selectedOrganization.name}`
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
    setShowOrgSearch(false)
    setSelectedOrganization(null)
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
                    disabled={(date) => date <= currentCheckOut}
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
                  <Card className="bg-muted">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{booking.guestName}</div>
                          <div className="text-sm text-muted-foreground">
                            Personal Account
                          </div>
                        </div>
                        {!showOrgSearch && !selectedOrganization && (
                          <Badge variant="outline">Default</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">OR</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowOrgSearch(!showOrgSearch)}
                    >
                      <Search className="mr-2 h-4 w-4" />
                      {showOrgSearch ? 'Hide' : 'Search'} Organization
                    </Button>

                    {showOrgSearch && (
                      <Card className="mt-2">
                        <CardContent className="p-2">
                          <Command>
                            <CommandInput placeholder="Search organization..." />
                            <CommandEmpty>No organization found.</CommandEmpty>
                            <CommandGroup>
                              {mockOrganizations.map((org) => (
                                <CommandItem
                                  key={org.id}
                                  onSelect={() => {
                                    setSelectedOrganization(org)
                                    setShowOrgSearch(false)
                                  }}
                                >
                                  <div className="flex-1">
                                    <div className="font-medium">{org.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      Balance: {formatNaira(org.balance)}
                                    </div>
                                  </div>
                                  <Check className={cn('ml-2 h-4 w-4', selectedOrganization?.id === org.id ? 'opacity-100' : 'opacity-0')} />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </CardContent>
                      </Card>
                    )}

                    {selectedOrganization && (
                      <Card className="mt-2 bg-primary/10 border-primary">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium">{selectedOrganization.name}</div>
                              <div className="text-sm text-muted-foreground">
                                Balance: {formatNaira(selectedOrganization.balance)}
                              </div>
                            </div>
                            <Badge variant="default">Selected</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
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
