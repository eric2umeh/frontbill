'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogScrollableBody,
  DialogScrollableFooter,
  DialogScrollableHeader,
  DialogTitle,
  dialogScrollableContentClass,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { StayDateRangeFields } from '@/components/shared/stay-date-range-fields'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { parseISO, addDays } from 'date-fns'
import { calendarNightsBetween } from '@/lib/booking/edit-booking-patch'
import { isStayCheckInConsideredBackdated, hotelCalendarTodayYmd } from '@/lib/hotel-date'
import { useNightAuditClosedDates } from '@/hooks/use-night-audit-closed-dates'
import {
  FolioRemarksAttachmentsField,
  type FolioRemarksAttachmentsValue,
} from '@/components/folio/folio-remarks-attachments-field'
import { persistFolioAttachments } from '@/lib/folio/persist-folio-attachments'
import { useAuth } from '@/lib/auth-context'
import { canFrontDeskApplyRescheduleStay } from '@/lib/booking/can-reschedule-stay'
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
  onSuccess: (result?: { applied?: boolean }) => void | Promise<void>
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
  const { role } = useAuth()
  const applyDirect = canFrontDeskApplyRescheduleStay(role)
  const [checkIn, setCheckIn] = useState<Date | undefined>()
  const [checkOut, setCheckOut] = useState<Date | undefined>()
  const [reason, setReason] = useState('')
  const [adjustmentDate, setAdjustmentDate] = useState('')
  const [folioExtras, setFolioExtras] = useState<FolioRemarksAttachmentsValue>({ remarks: '', files: [] })
  const [submitting, setSubmitting] = useState(false)
  const { closedDates: nightAuditClosedDates } = useNightAuditClosedDates(userId, open)

  useEffect(() => {
    if (!open || !booking) return
    setCheckIn(ymdToDate(booking.check_in))
    setCheckOut(ymdToDate(booking.check_out))
    setReason('')
    setAdjustmentDate(hotelCalendarTodayYmd())
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
      isStayCheckInConsideredBackdated(check_in, new Date(), undefined, {
        auditedDates: nightAuditClosedDates,
      }) && check_in !== prevCi
    const adjustmentBackdate =
      adjustmentDate.trim() &&
      isStayCheckInConsideredBackdated(adjustmentDate.trim(), new Date(), undefined, {
        auditedDates: nightAuditClosedDates,
      })
    return { total, balance, deposit, isBackdate, adjustmentBackdate }
  }, [booking, nights, checkIn, nightAuditClosedDates, adjustmentDate])

  const datesUnchanged =
    booking &&
    checkIn &&
    checkOut &&
    toYmd(checkIn) === booking.check_in.slice(0, 10) &&
    toYmd(checkOut) === booking.check_out.slice(0, 10)

  const submitBlockedReason = useMemo(() => {
    if (!checkIn || !checkOut) return 'Select check-in and check-out dates'
    if (nights < 1) return 'Check-out must be after check-in'
    if (datesUnchanged) return 'Change check-in or check-out from the current stay dates'
    if (!reason.trim()) return 'Enter a reason for the date change'
    if (!adjustmentDate.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(adjustmentDate.trim())) {
      return 'Choose a valid adjustment date'
    }
    return null
  }, [checkIn, checkOut, nights, datesUnchanged, reason, adjustmentDate])

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
    const adjustment_date = adjustmentDate.trim() || hotelCalendarTodayYmd()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(adjustment_date)) {
      toast.error('Choose a valid adjustment date')
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
          adjustment_date,
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
      toast.success(
        data.applied
          ? 'Stay dates updated'
          : 'Move-dates request sent for manager approval',
      )
      if (!data.applied) {
        const { dispatchNightAuditPendingChanged } = await import(
          '@/lib/utils/dispatch-night-audit-pending-changed'
        )
        dispatchNightAuditPendingChanged()
      }
      // Close first so a slow/failing refresh cannot leave the dialog open
      onClose()
      try {
        await onSuccess({ applied: Boolean(data.applied) })
      } catch (refreshErr) {
        console.warn('[reschedule-stay] refresh after submit', refreshErr)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to submit request'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={cn(dialogScrollableContentClass, 'sm:max-w-md')}>
        <DialogScrollableHeader>
          <DialogTitle>{applyDirect ? 'Move stay dates' : 'Request move stay dates'}</DialogTitle>
          <DialogDescription>
            {applyDirect
              ? 'Update the reservation check-in and check-out when the guest did not arrive on the reserved date. Changes apply immediately.'
              : 'Proposed dates are sent to a Manager, Administrator, or Superadmin for approval before the folio and room hold are updated.'}
          </DialogDescription>
        </DialogScrollableHeader>

        <DialogScrollableBody className="space-y-4">
          <StayDateRangeFields
            layout="inline"
            checkIn={checkIn}
            checkOut={checkOut}
            nights={nights}
            onDatesChange={(ci, co) => {
              setCheckIn(ci)
              if (co) {
                setCheckOut(co)
              } else if (checkOut && ci && checkOut > ci) {
                // Keep check-out while guest finishes picking a new range
              } else if (ci) {
                setCheckOut(addDays(ci, 1))
              }
            }}
          />

          <div className="space-y-2">
            <Label htmlFor="reschedule-adjustment-date">Adjustment date *</Label>
            <Input
              id="reschedule-adjustment-date"
              type="date"
              value={adjustmentDate}
              onChange={(e) => setAdjustmentDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Business date this change applies to (for receipts and accounting). Choose a past date
              if correcting a prior night — approvers will see it flagged like a backdate. You must
              also change check-in or check-out above (adjustment date alone is not enough).
            </p>
          </div>

          {(preview?.isBackdate || preview?.adjustmentBackdate) && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {preview?.isBackdate && (
                <>
                  This moves check-in to a past date. It will be flagged as{' '}
                  <strong>backdated</strong> for approvers in Night Audit.
                </>
              )}
              {preview?.isBackdate && preview?.adjustmentBackdate && ' '}
              {preview?.adjustmentBackdate && (
                <>The adjustment date is in the past and requires manager approval.</>
              )}
            </p>
          )}

          {preview && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Nights</span>
                <span className="font-medium">{nights}</span>
              </div>
              {(preview.isBackdate || preview.adjustmentBackdate) && (
                <Badge variant="outline" className="w-fit border-amber-500 text-amber-800">
                  {preview.isBackdate ? 'Backdated check-in' : 'Backdated adjustment'}
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
            remarksPlaceholder={applyDirect ? 'Optional extra notes…' : 'Extra context for approvers…'}
          />
        </DialogScrollableBody>

        <DialogScrollableFooter className="gap-2 sm:gap-0 flex-col sm:flex-row sm:items-center">
          {submitBlockedReason && !submitting && (
            <p className="text-xs text-muted-foreground sm:mr-auto order-first sm:order-none w-full sm:w-auto">
              {submitBlockedReason}
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || Boolean(submitBlockedReason)}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : applyDirect ? (
              'Save dates'
            ) : (
              'Submit for approval'
            )}
          </Button>
        </DialogScrollableFooter>
      </DialogContent>
    </Dialog>
  )
}
