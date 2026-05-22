'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { createClient } from '@/lib/supabase/client'
import {
  buildOutletThermalBillHtml,
  buildOutletThermalBillPayload,
  orderLinesToThermalLines,
} from '@/lib/receipts/outlet-thermal-bill'
import { exportElementToPdf, printHtmlDocument } from '@/lib/receipts/receipt-pdf-print'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletOrderRow } from '@/lib/outlets/types'

type OrgBranding = {
  hotelName: string
  address?: string | null
  phone?: string | null
}

export type OutletBillPrintKind = 'unsettled' | 'settled' | 'auto'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: OutletOrderRow | null
  department: OutletDepartmentKey
  departmentLabel: string
  organizationId: string
  staffName: string
  /** Auto-open print dialog when receipt opens. */
  autoPrint?: boolean
  /** Force unsettled vs settled layout; auto uses order.status. */
  billKind?: OutletBillPrintKind
}

export function OutletOrderReceiptDialog({
  open,
  onOpenChange,
  order,
  departmentLabel,
  organizationId,
  staffName,
  autoPrint = false,
  billKind = 'auto',
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [org, setOrg] = useState<OrgBranding | null>(null)
  const autoPrintedRef = useRef(false)

  useEffect(() => {
    if (!open || !organizationId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      if (!supabase) return
      const { data } = await supabase
        .from('organizations')
        .select('name, address, phone')
        .eq('id', organizationId)
        .maybeSingle()
      if (!cancelled && data) {
        setOrg({
          hotelName: String(data.name || '').trim() || 'Hotel',
          address: data.address,
          phone: data.phone,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, organizationId])

  useEffect(() => {
    if (!open) {
      autoPrintedRef.current = false
    }
  }, [open])

  const resolvedKind = useMemo((): 'unsettled' | 'settled' => {
    if (billKind === 'unsettled' || billKind === 'settled') return billKind
    return order?.status === 'settled' ? 'settled' : 'unsettled'
  }, [billKind, order?.status])

  const payload = useMemo(() => {
    if (!order) return null
    const lines = orderLinesToThermalLines(order.outlet_order_lines ?? [])
    return buildOutletThermalBillPayload({
      hotelName: org?.hotelName ?? 'Hotel',
      outletLabel: departmentLabel,
      orderNumber: order.order_number,
      printedAtIso: order.settled_at ?? order.created_at,
      tableLabel: order.table_label,
      waiterName: staffName,
      roomNumber: order.room_number,
      guestName: order.guest_name,
      lines,
      grandTotal: Number(order.subtotal),
      status: resolvedKind,
      isComplimentary: !!order.is_complimentary,
      preparedBy: staffName,
      paymentMethod: resolvedKind === 'settled' ? order.payment_method : null,
      paymentReference: resolvedKind === 'settled' ? order.order_number : null,
    })
  }, [order, org, departmentLabel, staffName, resolvedKind])

  const html = useMemo(() => (payload ? buildOutletThermalBillHtml(payload) : ''), [payload])

  const title =
    resolvedKind === 'settled' ? 'Settled receipt' : 'Unsettled bill'

  const handlePrint = useCallback(() => {
    if (!html) return
    try {
      printHtmlDocument(html)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open print dialog')
    }
  }, [html])

  useEffect(() => {
    if (!open || !autoPrint || !html || autoPrintedRef.current) return
    autoPrintedRef.current = true
    const t = window.setTimeout(() => {
      try {
        printHtmlDocument(html)
      } catch {
        /* user can click Print */
      }
    }, 500)
    return () => window.clearTimeout(t)
  }, [open, autoPrint, html])

  const handlePdf = useCallback(async () => {
    const iframe = iframeRef.current
    const body = iframe?.contentDocument?.body
    if (!body || !payload || !order) {
      toast.error('Bill preview is not ready')
      return
    }
    setPdfLoading(true)
    try {
      const safeNo = String(order.order_number).replace(/[^\w-]+/g, '_')
      const suffix = resolvedKind === 'settled' ? 'settled' : 'unsettled'
      await exportElementToPdf(body, `outlet-${suffix}-${safeNo}.pdf`)
      toast.success('PDF saved')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to export PDF')
    } finally {
      setPdfLoading(false)
    }
  }, [payload, order, resolvedKind])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[min(90vh,720px)] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {order?.order_number
              ? `${order.order_number} — ${departmentLabel}. Give unsettled bills to the guest before payment; print settled receipts after payment or room charge.`
              : 'Thermal bill for guest and outlet copy.'}
          </DialogDescription>
        </DialogHeader>
        {html ? (
          <>
            <div className="flex gap-2 justify-end shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button type="button" size="sm" onClick={() => void handlePdf()} disabled={pdfLoading}>
                {pdfLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Save PDF
              </Button>
            </div>
            <div className="flex-1 min-h-[360px] rounded-md border bg-white overflow-hidden">
              <iframe
                ref={iframeRef}
                title="Outlet bill preview"
                srcDoc={html}
                className="w-full h-[min(480px,55vh)] border-0 bg-white"
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No bill data.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
