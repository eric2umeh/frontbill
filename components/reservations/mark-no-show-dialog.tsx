'use client'

import { useEffect, useState } from 'react'
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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import {
  calculateNoShowFee,
  describeNoShowPolicy,
  fetchNoShowPolicy,
} from '@/lib/reservations/no-show-policy'
import { useAuth } from '@/lib/auth-context'

type BookingLike = {
  id: string
  guestName?: string
  folio_id?: string
  rate_per_night?: number
  total_amount?: number
  check_in?: string
  check_out?: string
  number_of_nights?: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: BookingLike | null
  onSuccess?: () => void
}

export function MarkNoShowDialog({ open, onOpenChange, booking, onSuccess }: Props) {
  const { organizationId, userId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [policyLabel, setPolicyLabel] = useState('')
  const [suggestedFee, setSuggestedFee] = useState(0)
  const [feeOverride, setFeeOverride] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open || !booking || !organizationId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      if (!supabase) return
      const policy = await fetchNoShowPolicy(supabase, organizationId)
      if (cancelled) return
      setPolicyLabel(describeNoShowPolicy(policy))
      const fee = calculateNoShowFee(policy, booking)
      setSuggestedFee(fee)
      setFeeOverride(String(fee))
      setNotes('')
    })()
    return () => {
      cancelled = true
    }
  }, [open, booking, organizationId])

  const handleConfirm = async () => {
    if (!booking || !userId) return
    setLoading(true)
    try {
      const supabase = createClient()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`
        }
      }

      const fee = feeOverride.trim() === '' ? undefined : Number(feeOverride)
      const res = await fetch(`/api/bookings/${booking.id}/no-show`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          caller_id: userId,
          fee_override: Number.isFinite(fee) ? fee : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to mark no-show')

      toast.success(
        `Marked as no-show — fee ${formatNaira(json.feeAmount ?? suggestedFee)} posted to folio`,
      )
      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No-show failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as No-Show</DialogTitle>
          <DialogDescription>
            {booking?.guestName || 'Guest'} will receive an individual folio for the no-show charge.
            The room will be released for sale.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-muted-foreground">Hotel policy</p>
            <p className="font-medium">{policyLabel || 'Loading…'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Suggested fee: {formatNaira(suggestedFee)}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="no_show_fee">Charge amount (₦)</Label>
            <Input
              id="no_show_fee"
              type="number"
              min="0"
              value={feeOverride}
              onChange={(e) => setFeeOverride(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Override the calculated fee if needed (e.g. negotiated rate).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="no_show_notes">Folio note (optional)</Label>
            <Input
              id="no_show_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="No-show — group block"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !booking}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm No-Show
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
