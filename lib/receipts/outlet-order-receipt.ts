import { escapeHtml } from '@/lib/utils/html-escape'
import { formatReceiptDateTime, formatAmountReceipt } from '@/lib/receipts/receipt-format'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletOrderLineRow, OutletOrderType } from '@/lib/outlets/types'

export type OutletOrderReceiptLine = {
  name: string
  qty: number
  unitPrice: number
  lineTotal: number
}

export type OutletOrderReceiptPayload = {
  hotelName: string
  address?: string | null
  phone?: string | null
  outletLabel: string
  orderNumber: string
  printedBy: string
  printedAtIso: string
  guestName?: string | null
  roomNumber?: string | null
  tableLabel?: string | null
  orderTypeLabel: string
  paymentMethodLabel: string
  lines: OutletOrderReceiptLine[]
  itemsSubtotal: number
  roomServiceFee: number
  grandTotal: number
  salesCategoryLabel: string
}

const ORDER_TYPE_LABELS: Record<OutletOrderType, string> = {
  dine_in: 'Dine in',
  takeaway: 'Take-away',
  room_service: 'Room service',
}

export function outletOrderTypeLabel(type: string): string {
  return ORDER_TYPE_LABELS[type as OutletOrderType] ?? type.replace(/_/g, ' ')
}

/** Legacy-style payment label (e.g. Folio Transfer for city ledger). */
export function outletReceiptPaymentLabel(method: string | null | undefined): string {
  const m = String(method || '').trim().toLowerCase()
  const map: Record<string, string> = {
    cash: 'CASH',
    pos: 'POS',
    card: 'CARD',
    transfer: 'TRANSFER',
    city_ledger: 'Folio Transfer',
    room_charge: 'Folio Transfer',
  }
  return map[m] ?? (m ? m.toUpperCase() : '—')
}

/** Sales category heading on legacy outlet receipts. */
export function outletSalesCategoryLabel(department: OutletDepartmentKey | string): string {
  const key = String(department)
  const map: Record<string, string> = {
    restaurant: 'FOOD',
    main_bar: 'BEVERAGE',
    pool_bar: 'BEVERAGE',
    banquets: 'EVENTS',
    laundry: 'LAUNDRY',
    gym: 'GYM',
  }
  return map[key] ?? 'SALES'
}

export function paymentGroupLabel(method: string | null | undefined): 'Cash' | 'Credit' {
  const m = String(method || '').trim().toLowerCase()
  if (m === 'city_ledger' || m === 'room_charge') return 'Credit'
  return 'Cash'
}

function receiptStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; background: #fff; }
    .wrap { max-width: 320px; margin: 0 auto; padding: 10px 12px 24px; }
    .hotel { font-size: 14px; font-weight: 700; text-align: center; letter-spacing: 0.04em; margin-bottom: 2px; }
    .title { font-size: 13px; font-weight: 700; text-align: center; margin: 8px 0 10px; text-decoration: underline; }
    .meta { font-size: 10px; line-height: 1.45; margin-bottom: 8px; }
    .meta div { display: flex; justify-content: space-between; gap: 8px; }
    .hr { border: none; border-top: 1px solid #000; margin: 8px 0; }
    .hr-dashed { border: none; border-top: 1px dashed #666; margin: 6px 0; }
    .section-h { font-weight: 700; font-size: 11px; margin: 6px 0 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { text-align: left; font-weight: 700; padding: 2px 0; border-bottom: 1px solid #000; }
    th.amt { text-align: right; }
    td { padding: 3px 0; vertical-align: top; }
    td.amt { text-align: right; white-space: nowrap; }
    td.indent { padding-left: 8px; }
    tr.sub td { font-weight: 700; border-top: 1px solid #000; padding-top: 4px; }
    tr.total td { font-weight: 700; font-size: 11px; border-top: 2px solid #000; padding-top: 5px; }
    .center { text-align: center; }
    .footer { margin-top: 14px; font-size: 10px; text-align: center; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .wrap { max-width: 80mm; padding: 0; }
    }
  `
}

function amtCell(n: number): string {
  return escapeHtml(formatAmountReceipt(n))
}

export function buildOutletOrderReceiptHtml(p: OutletOrderReceiptPayload): string {
  const hotel = escapeHtml(p.hotelName || 'Hotel')
  const outlet = escapeHtml(p.outletLabel.toUpperCase())
  const printedBy = escapeHtml(p.printedBy.toUpperCase())
  const printedAt = escapeHtml(formatReceiptDateTime(p.printedAtIso))
  const receiptNo = escapeHtml(p.orderNumber)
  const payGroup = paymentGroupLabel(p.paymentMethodLabel)
  const payLine = outletReceiptPaymentLabel(p.paymentMethodLabel)
  const salesCat = escapeHtml(p.salesCategoryLabel)

  const metaRows: string[] = []
  if (p.guestName) metaRows.push(`<div><span>Guest:</span><span>${escapeHtml(p.guestName)}</span></div>`)
  if (p.roomNumber) metaRows.push(`<div><span>Room:</span><span>${escapeHtml(p.roomNumber)}</span></div>`)
  if (p.tableLabel) metaRows.push(`<div><span>Table:</span><span>${escapeHtml(p.tableLabel)}</span></div>`)
  metaRows.push(`<div><span>Order type:</span><span>${escapeHtml(p.orderTypeLabel)}</span></div>`)

  const itemRows = p.lines
    .map(
      (l) =>
        `<tr><td class="indent">${escapeHtml(l.name)} ×${l.qty}</td><td class="amt">${amtCell(l.lineTotal)}</td></tr>`,
    )
    .join('')

  const roomFeeRow =
    p.roomServiceFee > 0
      ? `<tr><td class="indent">Room service fee</td><td class="amt">${amtCell(p.roomServiceFee)}</td></tr>`
      : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Receipt ${receiptNo}</title><style>${receiptStyles()}</style></head><body>
  <div class="wrap">
    <div class="hotel">${hotel}</div>
    <div class="title">SALES RECEIPT</div>
    <div class="meta">
      <div><span>Printed By:</span><span>${printedBy}</span></div>
      <div><span>Printed Date:</span><span>${printedAt}</span></motion>
      <div><span>Outlet:</span><span>${outlet}</span></div>
      <div><span>Receipt #:</span><span>${receiptNo}</span></div>
      ${metaRows.join('')}
    </div>
    <hr class="hr"/>
    <div class="section-h">Items</div>
    <table>
      <thead><tr><th>Particulars</th><th class="amt">Amount</th></tr></thead>
      <tbody>
        ${itemRows}
        ${roomFeeRow}
      </tbody>
    </table>
    <hr class="hr-dashed"/>
    <div class="section-h">Payment</div>
    <table>
      <thead><tr><th>Particulars</th><th class="amt">Amount</th></tr></thead>
      <tbody>
        <tr><td colspan="2" style="font-weight:700;padding-top:4px;">${escapeHtml(payGroup)}</td></tr>
        <tr><td class="indent">${escapeHtml(payLine)}</td><td class="amt">${amtCell(p.grandTotal)}</td></tr>
        <tr class="sub"><td>Sub Total</td><td class="amt">${amtCell(p.grandTotal)}</td></tr>
        <tr class="total"><td>Total Payment</td><td class="amt">${amtCell(p.grandTotal)}</td></tr>
      </tbody>
    </table>
    <hr class="hr-dashed"/>
    <div class="section-h">Sales</div>
    <table>
      <thead><tr><th>Particulars</th><th class="amt">Amount</th></tr></thead>
      <tbody>
        <tr><td colspan="2" style="font-weight:700;padding-top:4px;">Sales</td></tr>
        <tr><td class="indent">${salesCat}</td><td class="amt">${amtCell(p.itemsSubtotal)}</td></tr>
        ${p.roomServiceFee > 0 ? `<tr><td class="indent">Room service fee</td><td class="amt">${amtCell(p.roomServiceFee)}</td></tr>` : ''}
        <tr class="sub"><td>Sub Total</td><td class="amt">${amtCell(p.grandTotal)}</td></tr>
        <tr class="total"><td>Grand Total</td><td class="amt">${amtCell(p.grandTotal)}</td></tr>
      </tbody>
    </table>
    <div class="footer">Thank you</div>
  </div>
</body></html>`
}

export function buildOutletOrderReceiptPayload(input: {
  hotelName: string
  address?: string | null
  phone?: string | null
  outletLabel: string
  department: string
  orderNumber: string
  printedBy: string
  printedAtIso?: string
  guestName?: string | null
  roomNumber?: string | null
  tableLabel?: string | null
  orderType: string
  paymentMethod: string | null
  lines: OutletOrderLineRow[] | OutletOrderReceiptLine[]
  subtotal: number
  roomServiceFee?: number | null
}): OutletOrderReceiptPayload {
  const roomServiceFee = Number(input.roomServiceFee) || 0
  const grandTotal = Math.round(Number(input.subtotal) * 100) / 100
  const lines: OutletOrderReceiptLine[] = input.lines.map((l) => ({
    name: 'item_name' in l ? l.item_name : l.name,
    qty: Number(l.qty),
    unitPrice: Number(l.unit_price ?? l.unitPrice),
    lineTotal: Number(l.line_total ?? l.lineTotal),
  }))
  const itemsFromLines = lines
    .filter((l) => !l.name.toLowerCase().includes('room service delivery fee'))
    .reduce((s, l) => s + l.lineTotal, 0)
  const itemsSubtotal =
    roomServiceFee > 0 && Math.abs(itemsFromLines + roomServiceFee - grandTotal) < 0.02
      ? Math.round(itemsFromLines * 100) / 100
      : Math.round((grandTotal - roomServiceFee) * 100) / 100

  return {
    hotelName: input.hotelName,
    address: input.address,
    phone: input.phone,
    outletLabel: input.outletLabel,
    orderNumber: input.orderNumber,
    printedBy: input.printedBy,
    printedAtIso: input.printedAtIso ?? new Date().toISOString(),
    guestName: input.guestName,
    roomNumber: input.roomNumber,
    tableLabel: input.tableLabel,
    orderTypeLabel: outletOrderTypeLabel(input.orderType),
    paymentMethodLabel: input.paymentMethod ?? 'cash',
    lines,
    itemsSubtotal,
    roomServiceFee,
    grandTotal,
    salesCategoryLabel: outletSalesCategoryLabel(input.department),
  }
}
