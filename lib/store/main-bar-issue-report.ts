import { format } from 'date-fns'
import { isMainBarIssueDestination } from '@/lib/store/outlet-departments'
import { formatUnitLabel } from '@/lib/supply-chain/measurement-units'
import type { IssueOutRecord } from '@/lib/supply-chain/types'

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function mainBarIssueOutRows(log: IssueOutRecord[] | null | undefined): IssueOutRecord[] {
  return (log ?? []).filter((row) => isMainBarIssueDestination(row.destination))
}

/** CSV of Central Store issues to Main Bar (Excel-friendly UTF-8 BOM). */
export function downloadMainBarIssueReport(
  rows: IssueOutRecord[],
  opts?: { dateFrom?: string; dateTo?: string },
): void {
  const header = [
    'Date',
    'Time',
    'Item',
    'Quantity',
    'Unit',
    'Destination',
    'Received by',
    'Issued by',
    'Notes',
  ]
  const body = rows.map((row) => {
    const at = new Date(row.issuedAt)
    const valid = !Number.isNaN(at.getTime())
    return [
      valid ? format(at, 'yyyy-MM-dd') : '',
      valid ? format(at, 'HH:mm') : '',
      row.itemName,
      row.quantity,
      formatUnitLabel(row.unit),
      row.destination,
      row.receivedBy || '',
      row.issuedBy || '',
      row.notes || '',
    ]
  })
  const from = opts?.dateFrom || ''
  const to = opts?.dateTo || ''
  const stamp =
    from && to && from !== to
      ? `${from}_to_${to}`
      : from || to || format(new Date(), 'yyyy-MM-dd')
  downloadCsv(`frontbill-main-bar-store-issues-${stamp}.csv`, [header, ...body])
}
