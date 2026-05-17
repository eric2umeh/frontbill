'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { StayDateRangeFields } from '@/components/shared/stay-date-range-fields'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { parseISO } from 'date-fns'
import { calendarNightsBetween } from '@/lib/booking/edit-booking-patch'
import { isStayCheckInConsideredBackdated } from '@/lib/hotel-date'
import {
  FolioRemarksAttachmentsField,
  type FolioRemarksAttachmentsValue,
} from '@/components/folio/folio-remarks-attachments-field'
import { persistFolioAttachments } from '@/lib/folio/persist-folio-attachments'
import { createClient } from '@/lib/supabase/client'

export type RescheduleStayModalBooking = {
  id: string
  check_in: string
  check_out: string
  rate_per_night: number
  deposit?: number | null
  total_amount?: number | null
  balance?: number | null
}

function ymdToDate(ymd: string): Date {
  return parseISO(ymd.slice(0, 10))
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface RescheduleStayModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void | Promise<void>
  booking: RescheduleStayModalBooking | null
  userId: string | null | undefined
  organizationId?: string | null
}

export function RescheduleStayModal({
  open,
  onClose,
  onSuccess,
  booking,
  userId,
  organizationId,
}: RescheduleStayModalProps) {
  const [checkIn, setCheckIn] = useState<Date | undefined>()
  const [checkOut, setCheckOut] = useState<Date | undefined>()
  const [reason, setReason] = useState('')
  const [folioExtras, setFolioExtras] = useState<FolioRemarksAttachmentsValue>({ remarks: '', files: [] })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !booking) return
    setCheckIn(ymdToDate(booking.check_in))
    setCheckOut(ymdToDate(booking.check_out))
    setReason('')
    setFolioExtras({ remarks: '', files: [] })
  }, [open, booking])

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0
    const ci = toYmd(checkIn)
    const co = toYmd(checkOut)
    if (ci >= co) return 0
    try {
      return calendarNightsBetween(ci, co)
    } catch {
      return 0
    }
  }, [checkIn, checkOut])

  const preview = useMemo(() => {
    if (!booking || nights < 1 || !checkIn) return null
    const rate = Number(booking.rate_per_night ?? 0)
    const deposit = Number(booking.deposit ?? 0)
    const total = rate * nights
    const balance = Math.max(0, total - deposit)
    const check_in = toYmd(checkIn)
    const prevCi = booking.check_in.slice(0, 10)
    const isBackdate =
      isStayCheckInConsideredBackdated(check_in) && check_in !== prevCi
    return { total, balance, deposit, isBackdate }
  }, [booking, nights, checkIn])

  const datesUnchanged =
    booking &&
    checkIn &&
    checkOut &&
    toYmd(checkIn) === booking.check_in.slice(0, 10) &&
    toYmd(checkOut) === booking.check_out.slice(0, 10)

  async function handleSubmit() {
    if (!booking?.id || !userId || !checkIn || !checkOut) return
    const check_in = toYmd(checkIn)
    const check_out = toYmd(checkOut)
    if (check_in >= check_out) {
      toast.error('Check-out must be after check-in')
      return
    }
    if (!reason.trim()) {
      toast.error('Please enter a reason for the date change')
      return
    }
    if (datesUnchanged) {
      toast.error('Choose different dates before submitting')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/reschedule-stay-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_id: userId,
          booking_id: booking.id,
          check_in,
          check_out,
          reason: reason.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request')
      }
      const orgId = organizationId
      if (orgId && userId) {
        const supabase = createClient()
        const combinedRemarks = [reason.trim(), folioExtras.remarks.trim()]
          .filter(Boolean)
          .join('\n\n')
        const attachResult = await persistFolioAttachments(supabase, {
          organizationId: orgId,
          bookingId: booking.id,
          source: 'reschedule_stay',
          sourceId: data.request?.id || null,
          remarks: combinedRemarks || undefined,
          files: folioExtras.files,
          createdBy: userId,
        })
        if (!attachResult.ok) {
          toast.warning(`Request sent but attachment failed: ${attachResult.error}`)
        }
      }
      toast.success('Move-dates request sent for manager approval')
      await onSuccess()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to submit request'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request move stay dates</DialogTitle>
          <DialogDescription>
            Proposed dates are sent to a Manager, Administrator, or Superadmin for approval before the
            folio and room hold are updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <StayDateRangeFields
            layout="inline"
            checkIn={checkIn}
            checkOut={checkOut}
            nights={nights}
            onDatesChange={(ci, co) => {
              setCheckIn(ci)
              setCheckOut(co)
            }}
          />

          {preview?.isBackdate && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This moves check-in to a past date. It will be flagged as <strong>backdated</strong> for
              approvers in Night Audit.
            </p>
          )}

          {preview && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Nights</span>
                <span className="font-medium">{nights}</span>
              </div>
              {preview.isBackdate && (
                <Badge variant="outline" className="w-fit border-amber-500 text-amber-800">
                  Backdated check-in
                </Badge>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proposed total</span>
                <span className="font-medium">{formatNaira(preview.total)}</span>
              </div>
              {preview.deposit > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deposit (unchanged)</span>
                  <span className="font-medium">{formatNaira(preview.deposit)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance due</span>
                <span className="font-medium text-orange-700">{formatNaira(preview.balance)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reschedule-reason">Reason *</Label>
            <Textarea
              id="reschedule-reason"
              placeholder="e.g. Guest delayed arrival to tomorrow"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          <FolioRemarksAttachmentsField
            value={folioExtras}
            onChange={setFolioExtras}
            disabled={submitting}
            compact
            remarksLabel="Additional remarks (optional)"
            remarksPlaceholder="Extra context for approvers…"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !checkIn ||
              !checkOut ||
              nights < 1 ||
              Boolean(datesUnchanged) ||
              !reason.trim()
            }
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit for approval'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
