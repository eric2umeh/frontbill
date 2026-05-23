import { format, parseISO } from 'date-fns'
import { formatYMDInTimeZone, resolveHotelTimeZone } from '@/lib/hotel-date'
import type { OutletOrderRow } from '@/lib/outlets/types'

export type OutletSalesPaymentKey =
  | 'cash'
  | 'pos'
  | 'transfer'
  | 'city_ledger'
  | 'complimentary'
  | 'other'

export const OUTLET_SALES_SECTION_ORDER: { key: OutletSalesPaymentKey; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'pos', label: 'POS' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'city_ledger', label: 'Charge to room / folio' },
  { key: 'complimentary', label: 'Complimentary' },
  { key: 'other', label: 'Other' },
]

export type OutletSalesReportRow = {
  orderNumber: string
  timeLabel: string
  guest: string
  room: string | null
  table: string | null
  orderType: string
  itemCount: number
  itemsSummary: string
  total: number
  status: string
}

export type OutletSalesReportSection = {
  key: OutletSalesPaymentKey
  label: string
  rows: OutletSalesReportRow[]
  subtotal: number
}

export type OutletSalesReportBundle = {
  periodLabel: string
  sections: OutletSalesReportSection[]
  settledGrandTotal: number
  settledOrderCount: number
  openOrders: OutletSalesReportRow[]
  voidCount: number
}

export function normOutletPaymentKey(method: string | null | undefined): OutletSalesPaymentKey {
  if (method === 'complimentary') return 'complimentary'
  const m = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (m === 'room_charge') return 'city_ledger'
  if (m === 'cash') return 'cash'
  if (m === 'pos') return 'pos'
  if (m === 'transfer' || m === 'bank_transfer') return 'transfer'
  if (m === 'city_ledger') return 'city_ledger'
  if (m === 'card') return 'pos'
  return 'other'
}

function orderInstant(order: OutletOrderRow, useSettled: boolean): string {
  if (useSettled && order.settled_at) return order.settled_at
  return order.created_at
}

function orderYmd(order: OutletOrderRow, useSettled: boolean, timeZone: string): string {
  return formatYMDInTimeZone(new Date(orderInstant(order, useSettled)), timeZone)
}

function inYmdRange(ymd: string, fromYmd: string, toYmd: string): boolean {
  return ymd >= fromYmd && ymd <= toYmd
}

function buildRow(order: OutletOrderRow): OutletSalesReportRow {
  const lines = order.outlet_order_lines ?? []
  const itemCount = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const itemsSummary = lines
    .map((l) => `${l.item_name} ×${l.qty}`)
    .join(', ')
    .slice(0, 120)
  const instant = order.settled_at || order.created_at
  return {
    orderNumber: order.order_number,
    timeLabel: format(parseISO(instant), 'dd MMM yyyy · HH:mm'),
    guest: order.guest_name?.trim() || '—',
    room: order.room_number?.trim() || null,
    table: order.table_label?.trim() || null,
    orderType: String(order.order_type || 'takeaway').replace(/_/g, ' '),
    itemCount,
    itemsSummary: itemsSummary || '—',
    total: Number(order.subtotal) || 0,
    status: order.status,
  }
}

export function buildOutletSalesReport(
  orders: OutletOrderRow[],
  fromYmd: string,
  toYmd: string,
  timeZone?: string,
): OutletSalesReportBundle {
  const tz = resolveHotelTimeZone(timeZone)
  const periodLabel =
    fromYmd === toYmd
      ? format(parseISO(`${fromYmd}T12:00:00`), 'EEEE, d MMMM yyyy')
      : `${format(parseISO(`${fromYmd}T12:00:00`), 'd MMM yyyy')} – ${format(parseISO(`${toYmd}T12:00:00`), 'd MMM yyyy')}`

  const inRangeCreated = orders.filter((o) =>
    inYmdRange(orderYmd(o, false, tz), fromYmd, toYmd),
  )
  const settledInRange = orders.filter(
    (o) =>
      o.status === 'settled' &&
      inYmdRange(orderYmd(o, true, tz), fromYmd, toYmd),
  )
  const openInRange = inRangeCreated.filter((o) => o.status === 'open')
  const voidCount = inRangeCreated.filter((o) => o.status === 'void').length

  const buckets = new Map<OutletSalesPaymentKey, OutletSalesReportRow[]>()
  for (const key of OUTLET_SALES_SECTION_ORDER) {
    buckets.set(key.key, [])
  }

  let settledGrandTotal = 0
  for (const o of settledInRange) {
    const payKey = o.is_complimentary
      ? 'complimentary'
      : normOutletPaymentKey(o.payment_method)
    const row = buildRow(o)
    buckets.get(payKey)?.push(row)
    if (payKey !== 'complimentary') {
      settledGrandTotal += row.total
    }
  }

  settledGrandTotal = Math.round(settledGrandTotal * 100) / 100

  const sections: OutletSalesReportSection[] = OUTLET_SALES_SECTION_ORDER.map(({ key, label }) => {
    const rows = buckets.get(key) ?? []
    rows.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel))
    const subtotal = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100
    return { key, label, rows, subtotal }
  }).filter((s) => s.rows.length > 0)

  return {
    periodLabel,
    sections,
    settledGrandTotal,
    settledOrderCount: settledInRange.length,
    openOrders: openInRange.map(buildRow),
    voidCount,
  }
}
