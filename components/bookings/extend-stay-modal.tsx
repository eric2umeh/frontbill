'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { CreditCard, Check, X } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'
import { isSelectableLedgerName } from '@/lib/utils/ledger-organization'
import { resolveOrganizationLedgerAccount } from '@/lib/utils/resolve-ledger-account'

interface ExtendStayModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  booking: {
    id: string
    folioId: string
    guestName: string
    room: string
    currentCheckOut: string
    ratePerNight: number
    guestId: string
    guestBalance?: number
    organization_id?: string
    created_by?: string
    folio_status?: string
  }
}

export function ExtendStayModal({ open, onClose, onSuccess, booking }: ExtendStayModalProps) {
  const [newCheckOutDate, setNewCheckOutDate] = useState<Date | undefined>()
  const [paymentMethod, setPaymentMethod] = useState('')
  const [loading, setLoading] = useState(false)
  const [ledgerType, setLedgerType] = useState('individual')
  const [showOrgSearch, setShowOrgSearch] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  const [organizations, setOrganizations] = useState<any[]>([])
  const [filteredOrganizations, setFilteredOrganizations] = useState<any[]>([])
  const [orgSearchTerm, setOrgSearchTerm] = useState('')
  const [showNewOrgForm, setShowNewOrgForm] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgPhone, setNewOrgPhone] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

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
      const [{ data: ledgerData, error: ledgerError }, { data: orgData, error: orgError }] = await Promise.all([
        supabase
          .from('city_ledger_accounts')
          .select('id, account_name, balance, account_type, contact_phone')
          .eq('organization_id', booking.organization_id!)
          .neq('account_type', 'individual')
          .neq('account_type', 'guest')
          .order('account_name'),
        supabase
          .from('organizations')
          .select('id, name, phone, org_type')
          .neq('id', booking.organization_id!)
          .order('name'),
      ])

      if (ledgerError) throw ledgerError
      if (orgError) throw orgError
      const ledgerOrgs = (ledgerData || [])
        .filter((d: any) => isSelectableLedgerName(d.account_name))
        .map((d: any) => ({ id: d.id, name: d.account_name, current_balance: d.balance || 0, phone: d.contact_phone, source: 'city_ledger' }))
      const ledgerNames = new Set(ledgerOrgs.map((org: any) => org.name.toLowerCase()))
      const menuOrgs = (orgData || [])
        .filter((d: any) => d.org_type && isSelectableLedgerName(d.name) && !ledgerNames.has(String(d.name || '').toLowerCase()))
        .map((d: any) => ({ id: d.id, name: d.name, current_balance: 0, phone: d.phone, source: 'organizations' }))
      const accounts = [...ledgerOrgs, ...menuOrgs].sort((a, b) => a.name.localeCompare(b.name))
      setOrganizations(accounts)
      setFilteredOrganizations(accounts)
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

  const createNewOrganizationAccount = async () => {
    if (!newOrgName.trim()) {
      toast.error('Organization name is required')
      return
    }
    setCreatingOrg(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .insert([{
          organization_id: booking.organization_id,
          account_name: newOrgName.trim(),
          account_type: 'organization',
          contact_phone: newOrgPhone.trim() || null,
          balance: 0,
        }])
        .select('id, account_name, balance, contact_phone')
        .single()
      if (error) throw error
      const account = { id: data.id, name: data.account_name, current_balance: data.balance || 0, phone: data.contact_phone, source: 'city_ledger' }
      setOrganizations((prev) => [account, ...prev])
      setFilteredOrganizations((prev) => [account, ...prev])
      setSelectedLedger(account)
      setOrgSearchTerm(account.name)
      setShowNewOrgForm(false)
      setNewOrgName('')
      setNewOrgPhone('')
      toast.success(`Organization account "${account.name}" created and selected`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create organization account')
    } finally {
      setCreatingOrg(false)
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

    // Prevent extending checked-out folios
    if ((booking?.folio_status || 'active') === 'checked_out') {
      toast.error('This folio has been checked out and cannot be extended')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData.user?.id || booking.created_by || null
      
      // Add charge to folio_charges
      // For immediate payments (cash/pos/transfer): status = 'paid'
      // For deferred payments (city_ledger): status = 'pending'
      const isPaidNow = paymentMethod !== 'city_ledger'
      const chargeData: Record<string, unknown> = {
        booking_id: booking.id,
        description: `Extended Stay - ${additionalNights} night${additionalNights !== 1 ? 's' : ''}`,
        amount: additionalAmount,
        charge_type: 'extended_stay',
        payment_method: paymentMethod,
        ledger_account_id: paymentMethod === 'city_ledger' ? selectedLedger?.id : null,
        ledger_account_type: paymentMethod === 'city_ledger' ? ledgerType : null,
        payment_status: isPaidNow ? 'paid' : 'pending',
        created_by: currentUserId,
      }
      if (booking.organization_id) {
        chargeData.organization_id = booking.organization_id
      }

      const { error: chargeError } = await insertFolioCharges(supabase, [chargeData])
      if (chargeError) throw chargeError

      // Update booking checkout date
      await supabase
        .from('bookings')
        .update({ check_out: format(newCheckOutDate, 'yyyy-MM-dd') })
        .eq('id', booking.id)

      // Bump booking balance (city_ledger) OR deposit (paid now)
      if (paymentMethod === 'city_ledger') {
        const { data: freshBk } = await supabase
          .from('bookings')
          .select('balance')
          .eq('id', booking.id)
          .single()
        await supabase
          .from('bookings')
          .update({ balance: (freshBk?.balance || 0) + additionalAmount, payment_status: 'pending' })
          .eq('id', booking.id)
      } else {
        // Immediate payment (cash/pos/transfer/card) — increment deposit so Amount Paid is accurate
        const { data: freshBk } = await supabase
          .from('bookings')
          .select('deposit')
          .eq('id', booking.id)
          .single()
        await supabase
          .from('bookings')
          .update({ deposit: (Number(freshBk?.deposit) || 0) + additionalAmount })
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
          status: isPaidNow ? 'paid' : 'pending',
          description: `Extended Stay — ${additionalNights} night${additionalNights !== 1 ? 's' : ''}`,
          received_by: currentUserId,
        }])
      } catch (_) { /* non-fatal */ }

      // City ledger: update guest balance + city_ledger_accounts balance
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
              .update({ balance: ((guestRow.balance as number) || 0) + additionalAmount })
              .eq('id', booking.guestId)

            // If no city_ledger_account was selected, create/update one for this guest
            if (!selectedLedger?.id && guestRow.name) {
              const { data: existingAcct } = await supabase
                .from('city_ledger_accounts')
                .select('id, balance')
                .eq('organization_id', booking.organization_id)
                .ilike('account_name', guestRow.name)
                .maybeSingle()

              if (existingAcct) {
                await supabase
                  .from('city_ledger_accounts')
                  .update({ balance: (existingAcct.balance || 0) + additionalAmount })
                  .eq('id', existingAcct.id)
              } else {
                await supabase.from('city_ledger_accounts').insert([{
                  organization_id: booking.organization_id,
                  account_name: guestRow.name,
                  account_type: 'individual',
                  balance: additionalAmount,
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
            .update({ balance: (acct?.balance || 0) + additionalAmount })
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
                .update({ current_balance: ((orgRow.current_balance as number) || 0) + additionalAmount })
                .eq('id', selectedLedger.id)
            }
          }
        }
      }

      const accountInfo = paymentMethod === 'city_ledger' && selectedLedger 
        ? ` to ${selectedLedger.name}`
        : ''
      
      toast.success(`Stay extended to ${format(newCheckOutDate, 'PPP')}${accountInfo}`)
      onClose()
      resetForm()
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || 'Failed to extend stay')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setNewCheckOutDate(undefined)
    setPaymentMethod('')
    setLedgerType('individual')
    setShowOrgSearch(false)
    setSelectedLedger(null)
    setOrgSearchTerm('')
    setShowNewOrgForm(false)
    setNewOrgName('')
    setNewOrgPhone('')
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        onClose()
        resetForm()
      }
    }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92dvh,900px)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 shadow-xl sm:h-[min(88dvh,860px)]"
      >
        <DialogHeader className="relative shrink-0 space-y-1 border-b px-4 pb-3 pt-4 text-left sm:px-5 sm:pt-5">
          <DialogTitle className="pr-10 text-base font-semibold leading-snug sm:text-lg">
            Extend stay · {booking.folioId}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
            Pick a new checkout date, then choose payment and confirm below.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3 sm:px-5">
          {/* Guest Info Summary */}
          <div className="mb-3 space-y-1 rounded-lg bg-muted p-3 text-xs sm:text-sm">
            <div className="flex justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Guest</span>
              <span className="text-right font-medium">{booking.guestName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Room</span>
              <span className="font-medium">{booking.room}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Current checkout</span>
              <span className="text-right font-medium">{format(currentCheckOut, 'PP')}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Rate / night</span>
              <span className="font-medium">{formatNaira(booking.ratePerNight)}</span>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium sm:text-sm">New checkout date *</Label>
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={newCheckOutDate}
                  onSelect={setNewCheckOutDate}
                  disabled={(date) => date < currentCheckOut}
                  className="origin-top scale-[0.92] rounded-md border p-2 sm:scale-100 sm:p-3"
                />
              </div>
            </div>

            {newCheckOutDate && additionalNights > 0 && (
              <div className="space-y-2 rounded-lg bg-muted p-3 text-xs sm:p-4 sm:text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">New checkout</span>
                  <span className="font-semibold">{newCheckOutDate && format(newCheckOutDate, 'PP')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Extra nights</span>
                  <span className="font-semibold">{additionalNights}</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-bold sm:text-base">
                  <span>Total</span>
                  <span className="text-primary">{formatNaira(additionalAmount)}</span>
                </div>
              </div>
            )}

            {paymentMethod === 'city_ledger' && (
                <div className="space-y-3 border-t pt-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium sm:text-sm">Bill to account type *</Label>
                    <Select value={ledgerType} onValueChange={setLedgerType}>
                      <SelectTrigger className="h-9 text-xs sm:h-10 sm:text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual (guest)</SelectItem>
                        <SelectItem value="organization">Organization</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {ledgerType === 'individual' && (
                    <Card className="bg-muted">
                      <CardContent className="p-3">
                        <button
                          type="button"
                          onClick={() => setSelectedLedger({ id: booking.guestId, name: booking.guestName, balance: booking.guestBalance || 0 })}
                          className="w-full text-left transition-opacity hover:opacity-80"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">{booking.guestName}</div>
                              <div className="text-xs text-muted-foreground sm:text-sm">
                                Balance: {formatNaira(booking.guestBalance || 0)}
                              </div>
                            </div>
                            {selectedLedger?.id === booking.guestId ? (
                              <Badge variant="default" className="shrink-0 text-xs">
                                Selected
                              </Badge>
                            ) : (
                              !selectedLedger && (
                                <Badge variant="secondary" className="shrink-0 text-xs">
                                  Tap to select
                                </Badge>
                              )
                            )}
                          </div>
                        </button>
                      </CardContent>
                    </Card>
                  )}

                  {ledgerType === 'organization' && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-xs font-medium sm:text-sm">Search organization</Label>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowNewOrgForm(true)}>
                          + New account
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="relative">
                          <Input
                            placeholder="Search by name…"
                            value={orgSearchTerm || ''}
                            onChange={(e) => handleOrgSearch(e.target.value)}
                            className="h-9 rounded-md px-3 text-sm"
                          />
                        </div>

                        {orgSearchTerm && filteredOrganizations.length > 0 && (
                          <div className="max-h-40 overflow-y-auto rounded-md border sm:max-h-48">
                            {filteredOrganizations.map((org) => (
                              <button
                                key={org.id}
                                type="button"
                                onClick={async () => {
                                  try {
                                    const supabase = createClient()
                                    const resolved = await resolveOrganizationLedgerAccount(supabase, booking.organization_id!, org)
                                    setSelectedLedger(resolved)
                                    setOrgSearchTerm('')
                                    setFilteredOrganizations([])
                                  } catch (error: any) {
                                    toast.error(error.message || 'Failed to select organization')
                                  }
                                }}
                                className="flex w-full items-center justify-between border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{org.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Balance: {formatNaira(org.current_balance || 0)}
                                  </div>
                                </div>
                                {selectedLedger?.id === org.id && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                              </button>
                            ))}
                          </div>
                        )}

                        {orgSearchTerm && filteredOrganizations.length === 0 && (
                          <div className="rounded-md border p-3 text-center text-xs text-muted-foreground">
                            No organizations found
                          </div>
                        )}
                        {showNewOrgForm && (
                          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                            <Input placeholder="Organization name" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} className="h-9 text-sm" />
                            <Input placeholder="Phone (optional)" value={newOrgPhone} onChange={(e) => setNewOrgPhone(e.target.value)} className="h-9 text-sm" />
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowNewOrgForm(false)}>
                                Cancel
                              </Button>
                              <Button type="button" size="sm" className="h-8 text-xs" onClick={createNewOrganizationAccount} disabled={creatingOrg || !newOrgName.trim()}>
                                {creatingOrg ? 'Creating…' : 'Create & select'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedLedger && ledgerType === 'organization' && (
                    <Card className="mt-1 border-primary bg-primary/10">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{selectedLedger.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Balance: {formatNaira(selectedLedger.current_balance || 0)}
                            </div>
                          </div>
                          <Badge variant="default" className="shrink-0 text-xs">
                            Selected
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t bg-background px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] sm:px-5 sm:py-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium sm:text-sm">
              Payment method *
            </Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
              {['cash', 'pos', 'transfer', 'city_ledger'].map((method) => (
                <Button
                  key={method}
                  type="button"
                  variant={paymentMethod === method ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 text-[10px] font-medium uppercase tracking-wide sm:h-10 sm:text-xs"
                  onClick={() => {
                    setPaymentMethod(method)
                    if (method !== 'city_ledger') {
                      setShowOrgSearch(false)
                      setSelectedLedger(null)
                    }
                  }}
                >
                  {method.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            onClick={handleExtend}
            className="h-10 w-full text-sm font-semibold sm:h-11"
            disabled={!paymentMethod || !newCheckOutDate || additionalNights <= 0 || loading}
          >
            <CreditCard className="mr-2 h-4 w-4 shrink-0" />
            {loading ? 'Processing…' : 'Confirm extension'}
          </Button>
        </div>

        <DialogClose
          className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none sm:right-4 sm:top-4"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
