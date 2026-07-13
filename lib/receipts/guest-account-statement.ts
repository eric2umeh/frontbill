import { escapeHtml } from '@/lib/utils/html-escape'
import { formatNaira } from '@/lib/utils/currency'
import { receiptHotelHeaderRow } from '@/lib/receipts/receipt-logo'
import { formatPaymentMethodLabel } from '@/lib/payments/payment-methods'
export type GuestStatementLine = {
  date: string
  folioId: string
  description: string
  charge: number
  payment: number
  balance: number
}

export type GuestStatementPayload = {
  hotelName: string
  logoUrl?: string | null
  address?: string | null
  phone?: string | null
  guestName: string
  guestPhone?: string | null
  periodLabel: string
  printedAt: string
  printedBy: string
  openingBalance: number
  lines: GuestStatementLine[]
  totalCharges: number
  totalPayments: number
  closingBalance: number
}

function statementStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; color: #111; font-size: 12px; }
    .wrap { max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #444; margin-bottom: 16px; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f4f4f5; font-size: 11px; }
    td.r { text-align: right; white-space: nowrap; }
    .totals { margin-top: 16px; max-width: 320px; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { font-weight: 700; font-size: 14px; border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; }
  `
}

export function buildGuestAccountStatementHtml(p: GuestStatementPayload): string {
  const rows = p.lines
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.date)}</td>
        <td>${escapeHtml(l.folioId)}</td>
        <td>${escapeHtml(l.description)}</td>
        <td class="r">${l.charge > 0 ? escapeHtml(formatNaira(l.charge)) : '—'}</td>
        <td class="r">${l.payment > 0 ? escapeHtml(formatNaira(l.payment)) : '—'}</td>
        <td class="r">${escapeHtml(formatNaira(l.balance))}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Account Statement — ${escapeHtml(p.guestName)}</title>
    <style>${statementStyles()}</style></head><body>
    <div class="wrap">
      ${receiptHotelHeaderRow(p.logoUrl, p.hotelName, { maxHeightPx: 36, maxWidthPx: 100 })}
      <div class="sub">
        ${p.address ? `${escapeHtml(p.address)}<br/>` : ''}
        ${p.phone ? `Tel: ${escapeHtml(p.phone)}<br/>` : ''}
        <strong>Guest Account Statement</strong><br/>
        Guest: ${escapeHtml(p.guestName)}${p.guestPhone ? ` · ${escapeHtml(p.guestPhone)}` : ''}<br/>
        Period: ${escapeHtml(p.periodLabel)}<br/>
        Printed: ${escapeHtml(p.printedAt)} by ${escapeHtml(p.printedBy)}
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Folio</th><th>Description</th>
          <th class="r">Charge</th><th class="r">Payment</th><th class="r">Balance</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No activity in this period.</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div><span>Total charges</span><span>${escapeHtml(formatNaira(p.totalCharges))}</span></div>
        <div><span>Total payments</span><span>${escapeHtml(formatNaira(p.totalPayments))}</span></div>
        <div class="grand"><span>Closing balance</span><span>${escapeHtml(formatNaira(p.closingBalance))}</span></div>
      </div>
    </div></body></html>`
}
