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
import { useAuth } from '@/lib/auth-context'
import {
  calculateNoShowFee,
  describeNoShowPolicy,
  type NoShowPolicy,
} from '@/lib/reservations/no-show-policy'

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
  const { userId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policyLabel, setPolicyLabel] = useState('')
  const [suggestedFee, setSuggestedFee] = useState(0)
  const [usingDefaultPolicy, setUsingDefaultPolicy] = useState(false)
  const [feeOverride, setFeeOverride] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open || !booking || !userId) return
    let cancelled = false
    ;(async () => {
      setPolicyLoading(true)
      try {
        const supabase = createClient()
        const headers: Record<string, string> = {}
        if (supabase) {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`
          }
        }
        const res = await fetch('/api/organizations/billing-policy', {
          credentials: 'include',
          headers,
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setPolicyLabel('100% of room rate')
          setSuggestedFee(0)
          setUsingDefaultPolicy(true)
          return
        }

        const policy: NoShowPolicy = {
          feeMode: json.policy?.feeMode || json.no_show_fee_mode || 'percent',
          feePercent: Number(json.policy?.feePercent ?? json.no_show_fee_percent ?? 100),
          feeFlatAmount: Number(json.policy?.feeFlatAmount ?? json.no_show_fee_flat_amount ?? 0),
        }
        const fee = calculateNoShowFee(policy, booking)
        setPolicyLabel(describeNoShowPolicy(policy))
        setSuggestedFee(fee)
        setFeeOverride(String(fee))
        setUsingDefaultPolicy(Boolean(json.usingDefaultPolicy) || json.dbAvailable === false)
        setNotes('')
      } catch {
        if (!cancelled) {
          setPolicyLabel('100% of room rate')
          setUsingDefaultPolicy(true)
        }
      } finally {
        if (!cancelled) setPolicyLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, booking, userId])

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
            <p className="font-medium">{policyLoading ? 'Loading…' : policyLabel || '100% of room rate'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Suggested fee: {formatNaira(suggestedFee)}
            </p>
            {usingDefaultPolicy && (
              <p className="text-xs text-amber-700 mt-2">
                Policy could not be loaded from Settings — run{' '}
                <code className="rounded bg-amber-100 px-1">scripts/073_no_show_cashback_policy.sql</code>{' '}
                in Supabase, save under Settings → No-Show Billing, then reopen this dialog.
              </p>
            )}
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
          <Button onClick={handleConfirm} disabled={loading || !booking || policyLoading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm No-Show
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
