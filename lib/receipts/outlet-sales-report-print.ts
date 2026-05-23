import { escapeHtml } from '@/lib/utils/html-escape'
import { formatNaira } from '@/lib/utils/currency'
import type { OutletSalesReportBundle } from '@/lib/outlets/outlet-sales-report'
import { printHtmlDocument } from '@/lib/receipts/receipt-pdf-print'

function reportStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; font-size: 12px; color: #111; background: #fff; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #555; margin-bottom: 20px; font-size: 13px; }
    h2 { font-size: 15px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #111; }
    h2 .amt { float: right; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f4f4f5; font-weight: 600; }
    td.r, th.r { text-align: right; white-space: nowrap; }
    .items { max-width: 220px; color: #333; }
    .grand { margin-top: 24px; padding: 12px; background: #f4f4f5; border-radius: 8px; font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; }
    .meta { font-size: 11px; color: #666; margin-top: 16px; }
    @media print {
      .wrap { max-width: 100%; padding: 12px; }
      h2 { page-break-after: avoid; }
      tr { page-break-inside: avoid; }
    }
  `
}

function rowsTable(rows: OutletSalesReportBundle['sections'][0]['rows']): string {
  if (!rows.length) return '<p>No orders</p>'
  const body = rows
    .map(
      (r) => `<tr>
        <td class="mono">${escapeHtml(r.orderNumber)}</td>
        <td>${escapeHtml(r.timeLabel)}</td>
        <td>${escapeHtml(r.guest)}</td>
        <td>${escapeHtml(r.room || '—')}</td>
        <td>${escapeHtml(r.table || '—')}</td>
        <td class="r">${r.itemCount}</td>
        <td class="items">${escapeHtml(r.itemsSummary)}</td>
        <td>${escapeHtml(r.orderType)}</td>
        <td class="r">${escapeHtml(formatNaira(r.total))}</td>
      </tr>`,
    )
    .join('')
  return `<table>
    <thead><tr>
      <th>Receipt #</th><th>Time</th><th>Guest</th><th>Room</th><th>Table</th>
      <th class="r">Items</th><th>Line items</th><th>Type</th><th class="r">Total</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`
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
      (s) => `<h2>${escapeHtml(s.label)} <span class="amt">${escapeHtml(formatNaira(s.subtotal))} · ${s.rows.length} order(s)</span></h2>
      ${rowsTable(s.rows)}`,
    )
    .join('')

  const openHtml =
    report.openOrders.length > 0
      ? `<h2>Open / unsettled bills <span class="amt">${report.openOrders.length} order(s)</span></h2>${rowsTable(report.openOrders)}`
      : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(departmentLabel)} sales report</title>
    <style>${reportStyles()}</style></head><body>
    <div class="wrap">
      <h1>${escapeHtml(hotelName)}</h1>
      <p class="sub"><strong>${escapeHtml(departmentLabel)}</strong> — Sales report<br/>
      Period: ${escapeHtml(report.periodLabel)}<br/>
      Printed: ${escapeHtml(printedAt)}</p>
      ${sectionsHtml}
      ${openHtml}
      <div class="grand">
        <span>Settled sales total (${report.settledOrderCount} orders)</span>
        <span>${escapeHtml(formatNaira(report.settledGrandTotal))}</span>
      </div>
      <p class="meta">Voided in period: ${report.voidCount}. Open bills are not included in the settled total.</p>
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
