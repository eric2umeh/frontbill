import { escapeHtml } from '@/lib/utils/html-escape'
import type { OutletSalesSummaryBundle } from '@/lib/outlets/outlet-sales-summary-report'
import { outletReportThermalStyles } from '@/lib/receipts/outlet-report-thermal-styles'
import { printHtmlDocument } from '@/lib/receipts/receipt-pdf-print'

function formatReportAmount(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function amountRows(lines: { label: string; amount: number }[]): string {
  if (!lines.length) {
    return `<tr><td colspan="2">—</td></tr>`
  }
  return lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.label)}</td><td class="r">${formatReportAmount(l.amount)}</td></tr>`,
    )
    .join('')
}

export function buildOutletSalesSummaryHtml(input: {
  hotelName: string
  printedBy: string
  printedAt: string
  report: OutletSalesSummaryBundle
}): string {
  const { hotelName, printedBy, printedAt, report: r } = input

  const paymentBody =
    amountRows(r.paymentLines) +
    `<tr class="total"><td>Total</td><td class="r">${formatReportAmount(r.paymentTotal)}</td></tr>`

  const salesBody =
    amountRows(r.salesCategoryLines) +
    `<tr class="total"><td>Subtotal</td><td class="r">${formatReportAmount(r.salesSubtotal)}</td></tr>`

  const taxBody = `
    <tr><td>VAT</td><td class="r">${formatReportAmount(r.vatAmount)}</td></tr>
    <tr><td>SC</td><td class="r">${formatReportAmount(r.serviceChargeAmount)}</td></tr>
    <tr class="total"><td>Total</td><td class="r">${formatReportAmount(r.taxTotal)}</td></tr>
  `

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Sales Report Summary</title>
    <style>${outletReportThermalStyles()}</style></head><body>
    <div class="wrap">
      <p class="hotel">${escapeHtml(hotelName)}</p>
      <p class="title">Sales Report</p>
      <div class="meta">
        <div><span>Printed By:</span><span>${escapeHtml(printedBy)}</span></div>
        <div><span>Printed Date:</span><span>${escapeHtml(printedAt)}</span></div>
        <div><span>Date From:</span><span>${escapeHtml(r.dateRangeLabel)}</span></div>
        <div><span>Outlet:</span><span>${escapeHtml(r.outletLabel)}</span></div>
      </div>
      <div class="stats">
        <div><span>Total Receipt:</span><span>${r.totalReceipts}</span></div>
        <div><span>Total Pax:</span><span>${r.totalPax}</span></div>
        <div><span>Adult:</span><span>${r.totalPax}</span></div>
        <div><span>Child:</span><span>0</span></div>
        <div><span>Sales Per Receipt:</span><span>${formatReportAmount(r.salesPerReceipt)}</span></div>
        <div><span>Sales Per Pax:</span><span>${formatReportAmount(r.salesPerPax)}</span></div>
      </div>
      <hr class="hr"/>
      <h3>Payment Method</h3>
      <table class="sum"><thead><tr><th>Particulars</th><th class="r">Amount</th></tr></thead>
      <tbody>${paymentBody}</tbody></table>
      <h3>Sales Category</h3>
      <table class="sum"><thead><tr><th>Particulars</th><th class="r">Amount</th></tr></thead>
      <tbody><tr class="section"><td>Sales</td><td></td></tr>${salesBody}</tbody></table>
      <h3>Tax Breakdown</h3>
      <table class="sum"><thead><tr><th>Tax</th><th class="r">Amount</th></tr></thead>
      <tbody>${taxBody}</tbody></table>
      <table class="sum">
        <tbody><tr class="total"><td>Total</td><td class="r">${formatReportAmount(r.grandTotal)}</td></tr></tbody>
      </table>
      <p class="footnote">Settled only. VAT 7.5%. Open: ${r.openBillCount}. Void: ${r.voidCount}.</p>
    </div>
    </body></html>`
}

export function printOutletSalesSummaryReport(input: {
  hotelName: string
  printedBy: string
  report: OutletSalesSummaryBundle
}): void {
  const printedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
  const html = buildOutletSalesSummaryHtml({ ...input, printedAt })
  printHtmlDocument(html)
}
