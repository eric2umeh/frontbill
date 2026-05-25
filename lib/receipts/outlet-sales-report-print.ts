import { escapeHtml } from '@/lib/utils/html-escape'
import { formatNaira } from '@/lib/utils/currency'
import type { OutletSalesReportBundle, OutletSalesReportRow } from '@/lib/outlets/outlet-sales-report'
import { outletReportThermalStyles } from '@/lib/receipts/outlet-report-thermal-styles'
import { printHtmlDocument } from '@/lib/receipts/receipt-pdf-print'

function orderBlock(r: OutletSalesReportRow): string {
  const guestLine = r.guest ? `<div class="row"><span>Guest</span><span>${escapeHtml(r.guest)}</span></div>` : ''
  const roomLine = r.room
    ? `<div class="row"><span>Room</span><span>${escapeHtml(r.room)}</span></div>`
    : ''
  const tableLine = r.table
    ? `<div class="row"><span>Table</span><span>${escapeHtml(r.table)}</span></div>`
    : ''
  return `<div class="order">
    <div class="row"><span><strong>${escapeHtml(r.orderNumber)}</strong></span><span>${escapeHtml(r.timeLabel)}</span></div>
    ${guestLine}
    ${roomLine}
    ${tableLine}
    <div class="row"><span>Type</span><span>${escapeHtml(r.orderType)}</span></div>
    <div class="row"><span>Pay</span><span>${escapeHtml(r.paymentMethod)}</span></div>
    <div class="items">${r.itemCount} item(s): ${escapeHtml(r.itemsSummary)}</div>
    <div class="row"><span>Total</span><span><strong>${escapeHtml(formatNaira(r.total))}</strong></span></div>
  </div>`
}

function sectionBlocks(rows: OutletSalesReportRow[]): string {
  if (!rows.length) return '<p class="sub">No orders</p>'
  return rows.map(orderBlock).join('')
}

export function buildOutletSalesReportHtml(input: {
  hotelName: string
  departmentLabel: string
  printedAt: string
  report: OutletSalesReportBundle
}): string {
  const { hotelName, departmentLabel, printedAt, report } = input
  const sectionsHtml = report.sections
    .map(
      (s) => `<h2 class="sec">${escapeHtml(s.label)}
        <span class="amt">${escapeHtml(formatNaira(s.subtotal))} · ${s.rows.length} order(s)</span></h2>
      ${sectionBlocks(s.rows)}`,
    )
    .join('')

  const openHtml =
    report.openOrders.length > 0
      ? `<h2 class="sec">Open / unsettled
        <span class="amt">${report.openOrders.length} order(s)</span></h2>${sectionBlocks(report.openOrders)}`
      : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escapeHtml(departmentLabel)} sales</title>
    <style>${outletReportThermalStyles()}</style></head><body>
    <div class="wrap">
      <p class="hotel">${escapeHtml(hotelName)}</p>
      <p class="title">Full Sales Report</p>
      <div class="sub">
        <div><span>Outlet:</span><span>${escapeHtml(departmentLabel)}</span></div>
        <div><span>Period:</span><span>${escapeHtml(report.periodLabel)}</span></div>
        <div><span>Printed:</span><span>${escapeHtml(printedAt)}</span></div>
      </div>
      <hr class="hr"/>
      ${sectionsHtml}
      ${openHtml}
      <div class="grand">
        <span>Settled (${report.settledOrderCount})</span>
        <span>${escapeHtml(formatNaira(report.settledGrandTotal))}</span>
      </div>
      <p class="footnote">Voided: ${report.voidCount}. Open bills excluded from settled total.</p>
    </div>
    </body></html>`
}

export function printOutletSalesReport(input: {
  hotelName: string
  departmentLabel: string
  report: OutletSalesReportBundle
}): void {
  const printedAt = new Date().toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const html = buildOutletSalesReportHtml({ ...input, printedAt })
  printHtmlDocument(html)
}
