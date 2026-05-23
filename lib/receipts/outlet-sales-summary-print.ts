import { escapeHtml } from '@/lib/utils/html-escape'
import type { OutletSalesSummaryBundle } from '@/lib/outlets/outlet-sales-summary-report'
import { printHtmlDocument } from '@/lib/receipts/receipt-pdf-print'

function formatReportAmount(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function summaryStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 13px; color: #111; background: #fff; }
    .wrap { max-width: 520px; margin: 0 auto; padding: 20px 24px 32px; }
    .hotel { color: #1d4ed8; font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; }
    .title { color: #7c3aed; font-size: 18px; font-weight: 700; text-align: center; margin: 0 0 16px; }
    .meta { font-size: 12px; line-height: 1.6; margin-bottom: 16px; }
    .meta div { display: flex; justify-content: space-between; gap: 12px; }
    .stats { font-size: 12px; margin-bottom: 20px; line-height: 1.7; }
    .stats div { display: flex; justify-content: space-between; }
    h3 { font-size: 13px; font-weight: 700; margin: 16px 0 8px; text-decoration: underline; }
    table.sum { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
    table.sum th, table.sum td { border: 1px solid #333; padding: 5px 8px; }
    table.sum th { background: #f0f0f0; font-weight: 700; }
    table.sum td.r { text-align: right; white-space: nowrap; }
    table.sum tr.section td { font-weight: 700; background: #fafafa; }
    table.sum tr.total td { font-weight: 700; }
    .footnote { font-size: 10px; color: #555; margin-top: 20px; }
    @media print { .wrap { max-width: 100%; } }
  `
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

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Sales Report Summary</title>
    <style>${summaryStyles()}</style></head><body>
    <div class="wrap">
      <p class="hotel">${escapeHtml(hotelName)}</p>
      <p class="title">Sales Report</p>
      <div class="meta">
        <div><span>Printed By:</span><span>${escapeHtml(printedBy)}</span></div>
        <div><span>Printed Date:</span><span>${escapeHtml(printedAt)}</span></div>
        <div><span>Date Range:</span><span>From ${escapeHtml(r.dateRangeLabel)}</span></div>
        <div><span>Outlet:</span><span>${escapeHtml(r.outletLabel)}</span></div>
      </div>
      <div class="stats">
        <div><span>Total Receipt:</span><span>${r.totalReceipts}</span></div>
        <div><span>Total Pax:</span><span>${r.totalPax}</span></div>
        <div><span>&nbsp;&nbsp;Adult:</span><span>${r.totalPax}</span></div>
        <div><span>&nbsp;&nbsp;Child:</span><span>0</span></div>
        <div><span>Sales Per Receipt:</span><span>${formatReportAmount(r.salesPerReceipt)}</span></div>
        <div><span>Sales Per Pax:</span><span>${formatReportAmount(r.salesPerPax)}</span></div>
      </div>
      <h3>Payment Method</h3>
      <table class="sum"><thead><tr><th>Particulars</th><th class="r">Amount</th></tr></thead>
      <tbody>${paymentBody}</tbody></table>
      <h3>Sales Category</h3>
      <table class="sum"><thead><tr><th>Particulars</th><th class="r">Amount</th></tr></thead>
      <tbody><tr class="section"><td>Sales</td><td></td></tr>${salesBody}</tbody></table>
      <h3>Tax Breakdown</h3>
      <table class="sum"><thead><tr><th>Tax</th><th class="r">Amount</th></tr></thead>
      <tbody>${taxBody}</tbody></table>
      <table class="sum" style="margin-top:12px">
        <tbody><tr class="total"><td>Total</td><td class="r">${formatReportAmount(r.grandTotal)}</td></tr></tbody>
      </table>
      <p class="footnote">Settled orders only. VAT at 7.5% extracted from receipt totals. Open bills: ${r.openBillCount}. Voided: ${r.voidCount}.</p>
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
