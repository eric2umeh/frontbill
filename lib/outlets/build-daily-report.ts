import { formatYMDInTimeZone, resolveHotelTimeZone } from '@/lib/hotel-date'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import { getOutletDepartment } from '@/lib/outlets/departments'

export type OutletOrderForReport = {
  id: string
  order_number: string
  status: string
  order_type: string | null
  payment_method: string | null
  subtotal: number
  room_service_fee?: number | null
  guest_name: string | null
  room_number: string | null
  created_at: string
  settled_at: string | null
  outlet_order_lines?: {
    item_name: string
    qty: number
    line_total: number
  }[]
}

export type OutletDailyReportPayload = {
  department: OutletDepartmentKey
  department_label: string
  report_date: string
  order_count: number
  void_count: number
  gross_sales: number
  payment_breakdown: Record<string, number>
  top_items: { item_name: string; qty: number; revenue: number }[]
  summary: {
    by_order_type: Record<string, number>
    orders: {
      order_number: string
      time: string
      guest: string
      total: number
      payment_method: string
    }[]
  }
}

function normPayment(method: string | null | undefined): string {
  const m = String(method || 'cash').toLowerCase().replace(/-/g, '_')
  if (m === 'room_charge') return 'city_ledger'
  return m || 'cash'
}

function orderBusinessYmd(
  order: OutletOrderForReport,
  timeZone: string,
): string {
  const instant = order.settled_at || order.created_at
  return formatYMDInTimeZone(new Date(instant), timeZone)
}

export function buildOutletDailyReport(
  department: OutletDepartmentKey,
  reportDate: string,
  orders: OutletOrderForReport[],
  timeZone?: string,
): OutletDailyReportPayload {
  const tz = resolveHotelTimeZone(timeZone)
  const deptDef = getOutletDepartment(department)
  const dayOrders = orders.filter((o) => orderBusinessYmd(o, tz) === reportDate)
  const settled = dayOrders.filter((o) => o.status === 'settled')
  const voided = dayOrders.filter((o) => o.status === 'void')

  const payment_breakdown: Record<string, number> = {}
  const by_order_type: Record<string, number> = {}
  const itemMap = new Map<string, { qty: number; revenue: number }>()

  let gross_sales = 0
  for (const o of settled) {
    const amt = Number(o.subtotal) || 0
    gross_sales += amt
    const pay = normPayment(o.payment_method)
    payment_breakdown[pay] = (payment_breakdown[pay] || 0) + amt
    const ot = String(o.order_type || 'takeaway')
    by_order_type[ot] = (by_order_type[ot] || 0) + amt
    for (const line of o.outlet_order_lines ?? []) {
      const name = line.item_name?.trim() || 'Item'
      const prev = itemMap.get(name) ?? { qty: 0, revenue: 0 }
      prev.qty += Number(line.qty) || 0
      prev.revenue += Number(line.line_total) || 0
      itemMap.set(name, prev)
    }
  }
  gross_sales = Math.round(gross_sales * 100) / 100
  for (const k of Object.keys(payment_breakdown)) {
    payment_breakdown[k] = Math.round(payment_breakdown[k] * 100) / 100
  }

  const top_items = [...itemMap.entries()]
    .map(([item_name, v]) => ({ item_name, qty: v.qty, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 25)

  const ordersList = settled
    .map((o) => ({
      order_number: o.order_number,
      time: o.settled_at || o.created_at,
      guest: o.guest_name || o.room_number || '—',
      total: Number(o.subtotal) || 0,
      payment_method: normPayment(o.payment_method),
    }))
    .sort((a, b) => a.time.localeCompare(b.time))

  return {
    department,
    department_label: deptDef?.label ?? department,
    report_date: reportDate,
    order_count: settled.length,
    void_count: voided.length,
    gross_sales,
    payment_breakdown,
    top_items,
    summary: {
      by_order_type,
      orders: ordersList,
    },
  }
}
