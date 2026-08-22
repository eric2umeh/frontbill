import { format, parseISO } from 'date-fns'
import type { IssueOutRecord, StoreItem, SupplyDept } from '@/lib/supply-chain/types'
import { DEPT_LABELS, storeItemMatchesDept } from '@/lib/supply-chain/types'
import { formatUnitLabel } from '@/lib/supply-chain/measurement-units'
import { formatYMDInTimeZone, resolveHotelTimeZone } from '@/lib/hotel-date'

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

export function issuedYmd(iso: string): string {
  try {
    return formatYMDInTimeZone(new Date(iso), resolveHotelTimeZone())
  } catch {
    return ''
  }
}

/** Merge remote + local issue-out rows — local wins on id conflict; newest first. */
export function mergeIssueOutLogFromRemote(
  local: IssueOutRecord[],
  remote: IssueOutRecord[],
): IssueOutRecord[] {
  const byId = new Map<string, IssueOutRecord>()
  for (const row of remote) {
    if (row?.id) byId.set(row.id, row)
  }
  for (const row of local) {
    if (!row?.id) continue
    const existing = byId.get(row.id)
    if (!existing) {
      byId.set(row.id, row)
      continue
    }
    const lt = Date.parse(row.issuedAt) || 0
    const rt = Date.parse(existing.issuedAt) || 0
    byId.set(row.id, lt >= rt ? row : existing)
  }
  return [...byId.values()].sort(
    (a, b) => (Date.parse(b.issuedAt) || 0) - (Date.parse(a.issuedAt) || 0),
  )
}

export function issueOutRowMatchesDept(
  row: IssueOutRecord,
  dept: SupplyDept,
  storeItems: StoreItem[],
): boolean {
  if (dept === 'all') return true
  const item = storeItems.find((s) => s.id === row.storeItemId)
  if (item && storeItemMatchesDept(item, dept)) return true
  const label = (DEPT_LABELS[dept] ?? dept).toLowerCase()
  const dest = row.destination.trim().toLowerCase()
  return dest.includes(label) || dest === label
}

export function filterIssueOutLog(
  log: IssueOutRecord[] | null | undefined,
  opts: {
    dept?: SupplyDept
    storeItems?: StoreItem[]
    dateFrom?: string
    dateTo?: string
  },
): IssueOutRecord[] {
  let rows = [...(log ?? [])]
  const dept = opts.dept ?? 'all'
  if (dept !== 'all' && opts.storeItems) {
    rows = rows.filter((row) => issueOutRowMatchesDept(row, dept, opts.storeItems!))
  }
  const from = opts.dateFrom?.trim()
  const to = opts.dateTo?.trim()
  if (from || to) {
    rows = rows.filter((row) => {
      const ymd = issuedYmd(row.issuedAt)
      if (!ymd) return true
      if (from && ymd < from) return false
      if (to && ymd > to) return false
      return true
    })
  }
  return rows.sort(
    (a, b) => (Date.parse(b.issuedAt) || 0) - (Date.parse(a.issuedAt) || 0),
  )
}

export type IssueOutDailyStats = {
  issueCount: number
  lineCount: number
  totalAmount: number
}

/** Daily spend estimate from issue-out qty × catalogue last price. */
export function computeIssueOutDailyStats(
  rows: IssueOutRecord[],
  storeItems: StoreItem[],
): IssueOutDailyStats {
  let totalAmount = 0
  let lineCount = 0
  for (const row of rows) {
    if (!(Number(row.quantity) > 0)) continue
    lineCount += 1
    const item = storeItems.find((s) => s.id === row.storeItemId)
    const price = Number(item?.lastPrice) || 0
    totalAmount += row.quantity * price
  }
  return {
    issueCount: rows.length,
    lineCount,
    totalAmount,
  }
}

export function downloadIssueOutLogReport(
  rows: IssueOutRecord[],
  storeItems: StoreItem[],
  opts: { deptLabel?: string; dateFrom?: string; dateTo?: string },
): void {
  const header = [
    'Date',
    'Time',
    'Item',
    'Quantity',
    'Unit',
    'Unit price (₦)',
    'Line value (₦)',
    'Destination',
    'Received by',
    'Issued by',
    'Notes',
  ]
  const body = rows.map((row) => {
    const at = new Date(row.issuedAt)
    const valid = !Number.isNaN(at.getTime())
    const item = storeItems.find((s) => s.id === row.storeItemId)
    const unitPrice = Number(item?.lastPrice) || 0
    const lineValue = row.quantity * unitPrice
    return [
      valid ? format(at, 'yyyy-MM-dd') : '',
      valid ? format(at, 'HH:mm') : '',
      row.itemName,
      row.quantity,
      formatUnitLabel(row.unit),
      unitPrice,
      lineValue,
      row.destination,
      row.receivedBy || '',
      row.issuedBy || '',
      row.notes || '',
    ]
  })
  const from = opts.dateFrom || ''
  const to = opts.dateTo || ''
  const stamp =
    from && to && from !== to
      ? `${from}_to_${to}`
      : from || to || format(new Date(), 'yyyy-MM-dd')
  const deptSlug = (opts.deptLabel || 'all-departments')
    .toLowerCase()
    .replace(/\s+/g, '-')
  downloadCsv(`frontbill-issue-out-${deptSlug}-${stamp}.csv`, [header, ...body])
}

export function downloadStockLevelsReport(
  items: StoreItem[],
  opts: { deptLabel: string; dateYmd: string },
): void {
  const header = ['Item', 'Unit', 'Qty in store', 'Last price (₦)', 'Line value (₦)']
  let total = 0
  const body = items.map((item) => {
    const line = item.quantityInStore * (Number(item.lastPrice) || 0)
    total += line
    return [item.name, formatUnitLabel(item.unit), item.quantityInStore, item.lastPrice, line]
  })
  body.push(['', '', '', 'Total inventory value (₦)', total])
  const slug = opts.deptLabel.toLowerCase().replace(/\s+/g, '-')
  downloadCsv(`frontbill-central-store-${slug}-${opts.dateYmd}.csv`, [header, ...body])
}

export function formatIssueDateRangeLabel(dateFrom: string, dateTo: string): string {
  if (!dateFrom && !dateTo) return ''
  try {
    if (dateFrom && dateTo && dateFrom === dateTo) {
      return format(parseISO(dateFrom), 'dd MMM yyyy')
    }
    if (dateFrom && dateTo) {
      return `${format(parseISO(dateFrom), 'dd MMM yyyy')} – ${format(parseISO(dateTo), 'dd MMM yyyy')}`
    }
    if (dateFrom) return `From ${format(parseISO(dateFrom), 'dd MMM yyyy')}`
    return `To ${format(parseISO(dateTo), 'dd MMM yyyy')}`
  } catch {
    return ''
  }
}
