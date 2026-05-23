import type { SupabaseClient } from '@supabase/supabase-js'
import type { RevenueDepartment } from '@/lib/reports/revenue-category'
import { getOutletDepartment, OUTLET_DEPARTMENTS } from '@/lib/outlets/departments'
import { isFolioChargesOrgColumnError } from '@/lib/utils/insert-folio-charges'

/** Folio line created from restaurant, bar, laundry, gym, etc. */
export function isOutletFolioDescription(description: string | null | undefined): boolean {
  const d = String(description || '').trim()
  if (!d) return false
  for (const dept of OUTLET_DEPARTMENTS) {
    if (d.startsWith(`${dept.label} —`)) return true
  }
  return /\([A-Z]{2,}-\d+\)\s*$/i.test(d)
}

export function buildOutletFolioDescription(
  departmentLabel: string,
  lineDetail: string,
  orderNumber?: string,
): string {
  const base = `${departmentLabel} — ${lineDetail}`.slice(0, 480)
  if (!orderNumber) return base.slice(0, 500)
  return `${base} (${orderNumber})`.slice(0, 500)
}

type InsertOutletFolioInput = {
  bookingId: string
  organizationId: string
  userId: string
  description: string
  amount: number
  revenueCategory: RevenueDepartment
  paymentStatus: 'paid' | 'pending' | 'unpaid'
  paymentMethod: string | null
}

async function insertOutletFolioRow(
  supabase: SupabaseClient,
  input: InsertOutletFolioInput,
): Promise<string | null> {
  if (input.amount <= 0) return null

  const row: Record<string, unknown> = {
    booking_id: input.bookingId,
    organization_id: input.organizationId,
    description: input.description,
    amount: input.amount,
    charge_type: 'additional_charge',
    payment_method: input.paymentMethod,
    payment_status: input.paymentStatus,
    revenue_category: input.revenueCategory,
    created_by: input.userId,
  }

  let { data, error } = await supabase.from('folio_charges').insert([row]).select('id').single()

  if (error && isFolioChargesOrgColumnError(error)) {
    const { organization_id: _omit, ...stripped } = row
    const retry = await supabase.from('folio_charges').insert([stripped]).select('id').single()
    data = retry.data
    error = retry.error
  }

  if (error) throw new Error(error.message)
  return data?.id ?? null
}

/** Pending folio line when an open outlet bill is linked to an in-house booking. */
export async function postOpenOutletBillToBookingFolio(
  supabase: SupabaseClient,
  input: {
    bookingId: string
    organizationId: string
    userId: string
    department: string
    orderNumber: string
    amount: number
    lineDetail: string
  },
): Promise<string | null> {
  const dept = getOutletDepartment(input.department)
  const description = buildOutletFolioDescription(
    dept?.label ?? input.department,
    input.lineDetail,
    input.orderNumber,
  )

  const folioChargeId = await insertOutletFolioRow(supabase, {
    bookingId: input.bookingId,
    organizationId: input.organizationId,
    userId: input.userId,
    description,
    amount: input.amount,
    revenueCategory: dept?.revenueCategory ?? 'other',
    paymentStatus: 'pending',
    paymentMethod: null,
  })

  if (folioChargeId) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('balance, payment_status')
      .eq('id', input.bookingId)
      .maybeSingle()
    const newBalance = (Number(bk?.balance) || 0) + input.amount
    await supabase
      .from('bookings')
      .update({ balance: newBalance, payment_status: 'pending' })
      .eq('id', input.bookingId)
  }

  return folioChargeId
}

/** Paid-on-spot outlet sale linked to a booking — shows in folio and “paid on spot” summary. */
export async function postPaidOutletSaleToBookingFolio(
  supabase: SupabaseClient,
  input: {
    bookingId: string
    organizationId: string
    userId: string
    department: string
    orderNumber: string
    amount: number
    lineDetail: string
    paymentMethod: string
  },
): Promise<string | null> {
  const dept = getOutletDepartment(input.department)
  const description = buildOutletFolioDescription(
    dept?.label ?? input.department,
    input.lineDetail,
    input.orderNumber,
  )

  return insertOutletFolioRow(supabase, {
    bookingId: input.bookingId,
    organizationId: input.organizationId,
    userId: input.userId,
    description,
    amount: input.amount,
    revenueCategory: dept?.revenueCategory ?? 'other',
    paymentStatus: 'paid',
    paymentMethod: input.paymentMethod,
  })
}

export async function updateOutletFolioOnSettlement(
  supabase: SupabaseClient,
  input: {
    folioChargeId: string
    bookingId: string
    paymentMethod: string
    amount: number
    complimentary: boolean
  },
): Promise<void> {
  if (input.complimentary || input.amount <= 0) {
    await supabase.from('folio_charges').delete().eq('id', input.folioChargeId)
    return
  }

  const isCityLedger =
    input.paymentMethod === 'city_ledger' || input.paymentMethod === 'room_charge'

  if (isCityLedger) {
    await supabase
      .from('folio_charges')
      .update({
        payment_method: 'city_ledger',
        payment_status: 'pending',
        amount: input.amount,
      })
      .eq('id', input.folioChargeId)
    return
  }

  await supabase
    .from('folio_charges')
    .update({
      payment_method: input.paymentMethod,
      payment_status: 'paid',
      amount: input.amount,
    })
    .eq('id', input.folioChargeId)

  const { data: bk } = await supabase
    .from('bookings')
    .select('balance')
    .eq('id', input.bookingId)
    .maybeSingle()
  const newBalance = Math.max(0, (Number(bk?.balance) || 0) - input.amount)
  await supabase.from('bookings').update({ balance: newBalance }).eq('id', input.bookingId)
}

type OutletOrderForSync = {
  id: string
  department: string
  order_number: string
  subtotal: number | string
  status: string
  payment_method: string | null
  folio_charge_id: string | null
  is_complimentary?: boolean | null
  outlet_order_lines?: Array<{ item_name: string; qty: number }> | null
}

/** Backfill folio lines for settled/open outlet orders on a booking that never got a folio row. */
export async function syncOutletOrdersToBookingFolio(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    bookingId: string
    userId: string
  },
): Promise<number> {
  const { data: orders, error } = await supabase
    .from('outlet_orders')
    .select('id, department, order_number, subtotal, status, payment_method, folio_charge_id, is_complimentary, outlet_order_lines(item_name, qty)')
    .eq('organization_id', input.organizationId)
    .eq('booking_id', input.bookingId)
    .is('folio_charge_id', null)
    .in('status', ['open', 'settled'])

  if (error || !orders?.length) return 0

  let synced = 0
  for (const order of orders as OutletOrderForSync[]) {
    if (order.is_complimentary) continue
    const amount = Number(order.subtotal) || 0
    if (amount <= 0) continue

    const lines = order.outlet_order_lines ?? []
    const lineDetail = lines.map((l) => `${l.item_name} ×${l.qty}`).join(', ') || 'Outlet order'
    const method = String(order.payment_method || '').toLowerCase()

    let folioChargeId: string | null = null

    if (order.status === 'open') {
      folioChargeId = await postOpenOutletBillToBookingFolio(supabase, {
        bookingId: input.bookingId,
        organizationId: input.organizationId,
        userId: input.userId,
        department: order.department,
        orderNumber: order.order_number,
        amount,
        lineDetail,
      })
    } else if (method === 'city_ledger' || method === 'room_charge') {
      const dept = getOutletDepartment(order.department)
      folioChargeId = await insertOutletFolioRow(supabase, {
        bookingId: input.bookingId,
        organizationId: input.organizationId,
        userId: input.userId,
        description: buildOutletFolioDescription(
          dept?.label ?? order.department,
          lineDetail,
          order.order_number,
        ),
        amount,
        revenueCategory: dept?.revenueCategory ?? 'other',
        paymentStatus: 'pending',
        paymentMethod: 'city_ledger',
      })
      const { data: bk } = await supabase
        .from('bookings')
        .select('balance')
        .eq('id', input.bookingId)
        .maybeSingle()
      await supabase
        .from('bookings')
        .update({
          balance: (Number(bk?.balance) || 0) + amount,
          payment_status: 'pending',
        })
        .eq('id', input.bookingId)
    } else if (method && method !== 'complimentary') {
      folioChargeId = await postPaidOutletSaleToBookingFolio(supabase, {
        bookingId: input.bookingId,
        organizationId: input.organizationId,
        userId: input.userId,
        department: order.department,
        orderNumber: order.order_number,
        amount,
        lineDetail,
        paymentMethod: method,
      })
    }

    if (folioChargeId) {
      await supabase
        .from('outlet_orders')
        .update({ folio_charge_id: folioChargeId })
        .eq('id', order.id)
      synced += 1
    }
  }

  return synced
}
