import { escapeHtml } from '@/lib/utils/html-escape'
import { formatReceiptDateTime } from '@/lib/receipts/receipt-format'
import { OUTLET_FEE_LINE_NAMES } from '@/lib/outlets/order-extra-fees'
import { outletReceiptPaymentLabel } from '@/lib/receipts/outlet-order-receipt'
import type { OutletOrderLineRow } from '@/lib/outlets/types'

/** Nigeria VAT on outlet bills (7.5%). */
export const OUTLET_BILL_VAT_RATE = 0.075

export type OutletThermalLine = {
  name: string
  qty: number
  unit: string
  lineTotal: number
}

export type OutletThermalBillPayload = {
  hotelName: string
  outletLabel: string
  receiptNumber: string
  printedAtIso: string
  tableLabel?: string | null
  waiterName?: string | null
  roomNumber?: string | null
  guestName?: string | null
  lines: OutletThermalLine[]
  billAmount: number
  vatAmount: number
  grandTotal: number
  status: 'unsettled' | 'settled'
  isComplimentary?: boolean
  preparedBy: string
  paymentMethod?: string | null
  paymentReference?: string | null
  remark?: string | null
}

function formatThermalAmount(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function dottedLine(label: string, amount: number, width = 40): string {
  const amt = formatThermalAmount(amount)
  const dots = Math.max(2, width - label.length - amt.length)
  return `${label}${'.'.repeat(dots)}${amt}`
}

function thermalStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; background: #fff; }
    .wrap { max-width: 320px; margin: 0 auto; padding: 8px 10px 20px; }
    .center { text-align: center; }
    .outlet { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; margin: 4px 0; }
    .stars { text-align: center; letter-spacing: 1px; margin: 4px 0; font-size: 10px; }
    .meta-row { display: flex; justify-content: space-between; font-size: 10px; line-height: 1.35; }
    .meta-block { font-size: 10px; line-height: 1.4; margin: 6px 0; }
    .meta-block div { display: flex; justify-content: space-between; gap: 8px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 10px; margin: 4px 0; }
    table.items th { text-align: left; font-weight: 700; padding: 2px 0; border-bottom: 1px solid #000; }
    table.items th.r { text-align: right; }
    table.items td { padding: 2px 0; vertical-align: top; }
    table.items td.r { text-align: right; white-space: nowrap; }
    .totals { font-size: 10px; margin: 6px 0; line-height: 1.5; }
    .status { text-align: center; font-weight: 700; font-size: 12px; margin: 10px 0 6px; letter-spacing: 0.05em; }
    .dash { border: none; border-top: 1px dashed #333; margin: 8px 0; }
    .footer { font-size: 10px; line-height: 1.45; }
    @media print { .wrap { max-width: 80mm; padding: 0; } }
  `
}

export function splitOutletBillVat(grandTotal: number, vatRate = OUTLET_BILL_VAT_RATE): {
  billAmount: number
  vatAmount: number
  grandTotal: number
} {
  const total = Math.round(grandTotal * 100) / 100
  const billAmount = Math.round((total / (1 + vatRate)) * 100) / 100
  const vatAmount = Math.round((total - billAmount) * 100) / 100
  return { billAmount, vatAmount, grandTotal: total }
}

const FEE_NAMES = [
  OUTLET_FEE_LINE_NAMES.roomService.toLowerCase(),
  OUTLET_FEE_LINE_NAMES.takeaway.toLowerCase(),
]

export function orderLinesToThermalLines(
  rows: OutletOrderLineRow[],
  unitForItem?: (row: OutletOrderLineRow) => string,
): OutletThermalLine[] {
  return rows.map((r) => {
    const isFee = FEE_NAMES.some((f) => r.item_name.toLowerCase().includes(f))
    return {
      name: r.item_name,
      qty: Number(r.qty),
      unit: isFee ? 'EA' : unitForItem?.(r) ?? 'EA',
      lineTotal: Number(r.line_total),
    }
  })
}

export function buildOutletThermalBillPayload(input: {
  hotelName: string
  outletLabel: string
  orderNumber: string
  printedAtIso: string
  tableLabel?: string | null
  waiterName?: string | null
  roomNumber?: string | null
  guestName?: string | null
  lines: OutletThermalLine[]
  grandTotal: number
  status: 'unsettled' | 'settled'
  isComplimentary?: boolean
  preparedBy: string
  paymentMethod?: string | null
  paymentReference?: string | null
  remark?: string | null
}): OutletThermalBillPayload {
  const chargeTotal = input.isComplimentary ? 0 : input.grandTotal
  const { billAmount, vatAmount, grandTotal } = splitOutletBillVat(chargeTotal)
  return {
    hotelName: input.hotelName,
    outletLabel: input.outletLabel,
    receiptNumber: input.orderNumber,
    printedAtIso: input.printedAtIso,
    tableLabel: input.tableLabel,
    waiterName: input.waiterName,
    roomNumber: input.roomNumber,
    guestName: input.guestName,
    lines: input.lines,
    billAmount,
    vatAmount,
    grandTotal,
    status: input.status,
    isComplimentary: input.isComplimentary,
    preparedBy: input.preparedBy,
    paymentMethod: input.isComplimentary ? 'complimentary' : input.paymentMethod,
    paymentReference: input.paymentReference,
    remark: input.remark,
  }
}

export function buildOutletThermalBillHtml(p: OutletThermalBillPayload): string {
  const dt = formatReceiptDateTime(p.printedAtIso)
  const [datePart, timePart] = dt.includes(',') ? dt.split(',').map((s) => s.trim()) : [dt, '']
  const outlet = escapeHtml(p.outletLabel.toUpperCase())
  const hotel = escapeHtml(p.hotelName || '')
  const statusLabel = p.status === 'settled' ? 'Settled' : 'Unsettled'
  const payLabel = p.isComplimentary
    ? 'COMPLIMENTARY'
    : p.paymentMethod
      ? outletReceiptPaymentLabel(p.paymentMethod)
      : ''

  const itemRows = p.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}</td><td>${l.qty}</td><td>${escapeHtml(l.unit)}</td><td class="r">${formatThermalAmount(l.lineTotal)}</td></tr>`,
    )
    .join('')

  const paymentBlock =
    p.status === 'settled' && payLabel
      ? `<div class="meta-row"><span>${escapeHtml(payLabel)} #${escapeHtml(p.receiptNumber)}</span><span>${formatThermalAmount(p.grandTotal)}</span></div>`
      : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${statusLabel} ${escapeHtml(p.receiptNumber)}</title><style>${thermalStyles()}</style></head><body>
  <div class="wrap">
    <div class="center outlet">${outlet}</div>
    <div class="stars">******************************************</div>
    <div class="meta-row"><span>Receipt #: ${escapeHtml(p.receiptNumber)}</span><span>Date: ${escapeHtml(datePart)}</span></div>
    ${timePart ? `<div class="meta-row"><span></span><span>Time: ${escapeHtml(timePart)}</span></div>` : ''}
    <div class="meta-block">
      <div><span>Table #:</span><span>${escapeHtml(p.tableLabel || '')}</span></div>
      <div><span>Waiter:</span><span>${escapeHtml(p.waiterName || '')}</span></div>
      <div><span>Room No:</span><span>${escapeHtml(p.roomNumber || '')}</span></div>
      <div><span>Guest:</span><span>${escapeHtml(p.guestName || '')}</span></div>
    </div>
    <div class="stars">******************************************</div>
    <table class="items">
      <thead><tr><th>Item Name</th><th>Qty</th><th>Unit</th><th class="r">Amount</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="stars">******************************************</div>
    <div class="totals">
      <div>${dottedLine('Bill Amount', p.billAmount)}</div>
      <div>${dottedLine('VAT', p.vatAmount)}</div>
      <div>${dottedLine('TOTAL', p.grandTotal)}</div>
    </div>
    <div class="stars">******************************************</div>
    <div class="status">${statusLabel}</div>
    ${paymentBlock}
    <hr class="dash"/>
    <div class="footer center">Thank You.. ${hotel}</div>
    <div class="footer">Remark: ${escapeHtml(p.remark || '')}</div>
    <div class="footer">Bill Prepared By: ${escapeHtml(p.preparedBy.toUpperCase())}</div>
    <div class="footer">Payment Type: ${escapeHtml(payLabel)}${p.isComplimentary ? ' (no charge)' : ''}</div>
    <hr class="dash"/>
  </div>
</body></html>`
}
