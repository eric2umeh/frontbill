import { format, parseISO } from 'date-fns'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import { getOutletDepartment } from '@/lib/outlets/departments'
import {
  buildOutletSalesReport,
  OUTLET_SALES_SECTION_ORDER,
  type OutletSalesPaymentKey,
} from '@/lib/outlets/outlet-sales-report'
import { splitOutletBillVat } from '@/lib/receipts/outlet-thermal-bill'
import type { RevenueDepartment } from '@/lib/reports/revenue-category'
import type { OutletOrderRow } from '@/lib/outlets/types'

export type OutletSalesSummaryLine = {
  label: string
  amount: number
}

export type OutletSalesSummaryBundle = {
  periodLabel: string
  dateRangeLabel: string
  outletLabel: string
  totalReceipts: number
  totalPax: number
  salesPerReceipt: number
  salesPerPax: number
  paymentLines: OutletSalesSummaryLine[]
  paymentTotal: number
  salesCategoryLines: OutletSalesSummaryLine[]
  salesSubtotal: number
  vatAmount: number
  serviceChargeAmount: number
  taxTotal: number
  grandTotal: number
  settledOrderCount: number
  voidCount: number
  openBillCount: number
}

const SUMMARY_PAYMENT_LABELS: Record<OutletSalesPaymentKey, string> = {
  cash: 'Cash',
  pos: 'POS',
  transfer: 'Transfer',
  city_ledger: 'City ledger / folio',
  complimentary: 'Complimentary',
  other: 'Other',
}

const SALES_CATEGORY_LABEL: Partial<Record<RevenueDepartment, string>> = {
  restaurant: 'FOOD',
  bar: 'BEVERAGE',
  laundry: 'LAUNDRY',
  gym: 'GYM',
  events: 'EVENTS',
  swimming: 'SWIMMING',
  other: 'OTHER',
}

function salesCategoryLabelForOutlet(department: OutletDepartmentKey): string {
  const cat = getOutletDepartment(department)?.revenueCategory ?? 'other'
  return SALES_CATEGORY_LABEL[cat] ?? cat.replace(/_/g, ' ').toUpperCase()
}

export function buildOutletSalesSummaryReport(
  orders: OutletOrderRow[],
  fromYmd: string,
  toYmd: string,
  department: OutletDepartmentKey,
): OutletSalesSummaryBundle {
  const detail = buildOutletSalesReport(orders, fromYmd, toYmd)
  const deptDef = getOutletDepartment(department)
  const outletLabel = (deptDef?.label ?? department).toUpperCase()

  const dateRangeLabel =
    fromYmd === toYmd
      ? format(parseISO(`${fromYmd}T12:00:00`), 'M/d/yyyy')
      : `${format(parseISO(`${fromYmd}T12:00:00`), 'M/d/yyyy')} to ${format(parseISO(`${toYmd}T12:00:00`), 'M/d/yyyy')}`

  const paymentLines: OutletSalesSummaryLine[] = []
  let paymentTotal = 0
  for (const { key } of OUTLET_SALES_SECTION_ORDER) {
    const section = detail.sections.find((s) => s.key === key)
    const amount = section?.subtotal ?? 0
    if (amount <= 0) continue
    paymentLines.push({ label: SUMMARY_PAYMENT_LABELS[key], amount })
    if (key !== 'complimentary') paymentTotal += amount
  }
  paymentTotal = Math.round(paymentTotal * 100) / 100

  const grandTotal = detail.settledGrandTotal
  const { billAmount: netSales, vatAmount } = splitOutletBillVat(grandTotal)
  const serviceChargeAmount = 0
  const taxTotal = Math.round((vatAmount + serviceChargeAmount) * 100) / 100

  const categoryName = salesCategoryLabelForOutlet(department)
  const salesCategoryLines: OutletSalesSummaryLine[] =
    netSales > 0 ? [{ label: categoryName, amount: netSales }] : []

  const totalReceipts = detail.settledOrderCount
  const totalPax = totalReceipts
  const salesPerReceipt = totalReceipts > 0 ? Math.round((grandTotal / totalReceipts) * 100) / 100 : 0
  const salesPerPax = totalPax > 0 ? Math.round((grandTotal / totalPax) * 100) / 100 : 0

  return {
    periodLabel: detail.periodLabel,
    dateRangeLabel,
    outletLabel,
    totalReceipts,
    totalPax,
    salesPerReceipt,
    salesPerPax,
    paymentLines,
    paymentTotal,
    salesCategoryLines,
    salesSubtotal: netSales,
    vatAmount,
    serviceChargeAmount,
    taxTotal,
    grandTotal,
    settledOrderCount: detail.settledOrderCount,
    voidCount: detail.voidCount,
    openBillCount: detail.openOrders.length,
  }
}
