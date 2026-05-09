'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  buildPaymentReceiptHtml,
  defaultPaymentRemark,
  formatReceiptPaymentMethod,
  receiptNumberFromId,
  type PaymentReceiptPayload,
  type PaymentReceiptBranding,
} from '@/lib/receipts/receipt-format'
import { amountInWordsNgn } from '@/lib/utils/amount-in-words-ngn'
import { exportElementToPdf, printHtmlDocument } from '@/lib/receipts/receipt-pdf-print'

export type PaymentReceiptChargeRow = {
  id: string
  timestamp: string
  description?: string
  amount: number
  type: string
  createdBy?: string
  paymentMethod?: string | null
}

type OrgProfile = PaymentReceiptBranding

type BookingLike = {
  folio_id?: string | null
  guests?: { name?: string | null }
  guestName?: string | null
  rooms?: { room_number?: string | null } | null
}

function buildPayload(
  org: OrgProfile | null,
  booking: BookingLike,
  charge: PaymentReceiptChargeRow,
  currentUserLabel: string,
): PaymentReceiptPayload {
  const amount = Math.abs(Number(charge.amount) || 0)
  const hotelName = org?.hotelName?.trim() || 'Hotel'
  return {
    hotelName,
    address: org?.address ?? '',
    phone: org?.phone ?? '',
    email: org?.email ?? '',
    guestName:
      String(booking.guests?.name || booking.guestName || 'Guest')
        .trim() || 'Guest',
    roomNumber: String(booking.rooms?.room_number ?? '—'),
    folioNumber: String(booking.folio_id ?? '—'),
    receiptNumber: receiptNumberFromId(charge.id),
    issuedAtIso: charge.timestamp,
    paymentMethodLabel: formatReceiptPaymentMethod(charge.paymentMethod),
    amount,
    amountInWords: amountInWordsNgn(amount).toUpperCase(),
    remark: defaultPaymentRemark(),
    staffName: (charge.createdBy || currentUserLabel || 'Staff').toUpperCase(),
  }
}

type PaymentReceiptDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organization: OrgProfile | null
  booking: BookingLike | null
  charge: PaymentReceiptChargeRow | null
  currentUserName: string | null
}

export function PaymentReceiptDialog({
  open,
  onOpenChange,
  organization,
  booking,
  charge,
  currentUserName,
}: PaymentReceiptDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  const currentUserLabel = currentUserName || 'Staff'

  const payload = useMemo(() => {
    if (!booking || !charge) return null
    return buildPayload(organization, booking, charge, currentUserLabel)
  }, [organization, booking, charge, currentUserLabel])

  const html = useMemo(() => (payload ? buildPaymentReceiptHtml(payload) : ''), [payload])

  const handlePrint = useCallback(() => {
    if (!html) return
    try {
      printHtmlDocument(html)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open print dialog')
    }
  }, [html])

  const handlePdf = useCallback(async () => {
    const iframe = iframeRef.current
    const body = iframe?.contentDocument?.body
    if (!body || !payload) {
      toast.error('Receipt preview is not ready')
      return
    }
    setPdfLoading(true)
    try {
      const safeFolio = String(booking?.folio_id ?? 'folio').replace(/[^\w-]+/g, '_')
      const fileName = `receipt-${payload.receiptNumber}-${safeFolio}.pdf`
      await exportElementToPdf(body, fileName)
      toast.success('PDF saved')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to export PDF')
    } finally {
      setPdfLoading(false)
    }
  }, [payload, booking?.folio_id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[min(90vh,900px)] flex flex-col">
        <DialogHeader>
          <DialogTitle>Payment receipt</DialogTitle>
          <DialogDescription>
            Duplicate copy: one for the front desk and one for the guest. Print or save as PDF.
          </DialogDescription>
        </DialogHeader>
        {html ? (
          <>
            <div className="flex gap-2 justify-end shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button type="button" size="sm" onClick={handlePdf} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                Save PDF
              </Button>
            </div>
            <div className="flex-1 min-h-[420px] rounded-md border bg-white overflow-hidden">
              <iframe
                ref={iframeRef}
                title="Payment receipt preview"
                srcDoc={html}
                className="w-full h-[min(520px,60vh)] border-0 bg-white"
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No receipt data.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
