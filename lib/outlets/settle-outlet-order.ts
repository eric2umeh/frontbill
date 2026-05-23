import type { SupabaseClient } from '@supabase/supabase-js'
import { getOutletDepartment } from '@/lib/outlets/departments'
import {
  hasOutletCityLedgerChargeTarget,
  resolveOutletCustomerContext,
} from '@/lib/outlets/resolve-outlet-customer'
import { recordOutletImmediatePayment } from '@/lib/outlets/outlet-financial-integration'
import { postOutletCityLedgerCharge } from '@/lib/outlets/post-outlet-city-ledger'
import {
  OUTLET_FEE_LINE_NAMES,
  parseOutletOrderExtraFees,
} from '@/lib/outlets/order-extra-fees'

function isCityLedgerPayment(method: string) {
  return method === 'city_ledger' || method === 'room_charge'
}

function isComplimentaryOrder(order: { is_complimentary?: boolean | null }, method: string) {
  return !!order.is_complimentary || method === 'complimentary'
}

export type SettleOutletOrderResult = {
  order: Record<string, unknown>
  lines: Array<{
    item_id: string
    item_name: string
    qty: number
    unit_price: number
    line_total: number
  }>
}

export async function settleOutletOrderRecord(
  admin: SupabaseClient,
  input: {
    organizationId: string
    userId: string
    orderId: string
    paymentMethod: string
    bookingId?: string | null
    cityLedgerAccountId?: string | null
    guestName?: string | null
    roomNumber?: string | null
  },
): Promise<SettleOutletOrderResult> {
  const { data: order, error: loadErr } = await admin
    .from('outlet_orders')
    .select('*, outlet_order_lines(*)')
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (loadErr || !order) throw new Error(loadErr?.message || 'Order not found')
  if (order.status === 'void') throw new Error('Order is void')
  if (order.status === 'settled') throw new Error('Order is already settled')

  const complimentary = isComplimentaryOrder(order, input.paymentMethod)
  const paymentMethod = complimentary
    ? 'complimentary'
    : isCityLedgerPayment(input.paymentMethod)
      ? 'city_ledger'
      : input.paymentMethod

  const roomNumber = input.roomNumber?.trim() || order.room_number || null
  const resolvedCustomer = await resolveOutletCustomerContext(admin, input.organizationId, {
    bookingId: input.bookingId?.trim() || order.booking_id || null,
    guestName: input.guestName?.trim() || order.guest_name || null,
    roomNumber,
  })
  let bookingId = resolvedCustomer.bookingId
  const guestName = resolvedCustomer.guestName
  const cityLedgerAccountId = input.cityLedgerAccountId?.trim() || null
  const department = String(order.department)
  const deptDef = getOutletDepartment(department)
  const subtotal = complimentary ? 0 : Number(order.subtotal)
  const orderNumber = String(order.order_number)

  const lines = (order.outlet_order_lines ?? []) as Array<{
    item_name: string
    qty: number
  }>
  const lineDetail = lines.map((l) => `${l.item_name} ×${l.qty}`).join(', ')

  if (!complimentary && paymentMethod === 'city_ledger') {
    if (!hasOutletCityLedgerChargeTarget(resolvedCustomer, cityLedgerAccountId)) {
      throw new Error(
        'In-house room with active stay, guest name, or city ledger account required to charge to room',
      )
    }
  }

  let folioChargeId: string | null = order.folio_charge_id ?? null
  let ledgerAccountId: string | null = order.city_ledger_account_id ?? null

  if (paymentMethod === 'city_ledger' && !folioChargeId) {
    const result = await postOutletCityLedgerCharge(admin, {
      organizationId: input.organizationId,
      userId: input.userId,
      departmentLabel: deptDef?.label ?? department,
      revenueCategory: deptDef?.revenueCategory ?? 'other',
      amount: subtotal,
      lineDetail,
      orderNumber,
      bookingId,
      ledgerAccountId: cityLedgerAccountId,
      guestName,
      roomNumber,
    })
    folioChargeId = result.folioChargeId
    ledgerAccountId = result.ledgerAccountId
  } else if (!complimentary && paymentMethod !== 'city_ledger') {
    await recordOutletImmediatePayment(admin, {
      organizationId: input.organizationId,
      userId: input.userId,
      orderId: order.id,
      orderNumber,
      department,
      departmentLabel: deptDef?.label ?? department,
      amount: subtotal,
      paymentMethod,
      lineDetail,
      bookingId,
      guestName,
      roomNumber,
    })
  }

  const settledAt = new Date().toISOString()
  const { data: updated, error: upErr } = await admin
    .from('outlet_orders')
    .update({
      status: 'settled',
      payment_method: paymentMethod,
      booking_id: bookingId,
      guest_name: guestName,
      room_number: roomNumber,
      folio_charge_id: folioChargeId,
      city_ledger_account_id: ledgerAccountId,
      settled_by: input.userId,
      settled_at: settledAt,
    })
    .eq('id', order.id)
    .select('*, outlet_order_lines(*)')
    .single()

  if (upErr || !updated) throw new Error(upErr?.message || 'Could not settle order')

  const lineRows = (updated.outlet_order_lines ?? []) as SettleOutletOrderResult['lines']
  return { order: updated as Record<string, unknown>, lines: lineRows }
}

export type CreateOutletOrderInput = {
  organizationId: string
  userId: string
  department: string
  orderNumber: string
  orderType: string
  guestName: string | null
  roomNumber: string | null
  tableLabel: string | null
  bookingId: string | null
  subtotal: number
  roomServiceFee: number
  takeawayFee: number
  paymentMethod: string
  notes: string | null
  orderLines: Array<{
    item_id: string
    item_name: string
    qty: number
    unit_price: number
    line_total: number
  }>
  settleNow: boolean
  cityLedgerAccountId?: string | null
  isComplimentary?: boolean
}

export async function createOutletOrderRecord(
  admin: SupabaseClient,
  input: CreateOutletOrderInput,
): Promise<SettleOutletOrderResult> {
  const isComplimentary = !!input.isComplimentary
  const chargeSubtotal = isComplimentary ? 0 : input.subtotal
  const roomServiceFee = isComplimentary ? 0 : input.roomServiceFee
  const takeawayFee = isComplimentary ? 0 : input.takeawayFee

  const { data: order, error: oe } = await admin
    .from('outlet_orders')
    .insert({
      organization_id: input.organizationId,
      department: input.department,
      order_number: input.orderNumber,
      status: 'open',
      order_type: input.orderType,
      guest_name: input.guestName,
      room_number: input.roomNumber,
      table_label: input.tableLabel,
      booking_id: input.bookingId,
      subtotal: chargeSubtotal,
      room_service_fee: roomServiceFee,
      takeaway_fee: takeawayFee,
      is_complimentary: isComplimentary,
      payment_method: null,
      notes: input.notes,
      created_by: input.userId,
    })
    .select()
    .single()

  if (oe || !order) throw new Error(oe?.message || 'Order failed')

  const linesToInsert = [...input.orderLines]
  if (roomServiceFee > 0) {
    linesToInsert.push({
      item_id: '',
      item_name: OUTLET_FEE_LINE_NAMES.roomService,
      qty: 1,
      unit_price: roomServiceFee,
      line_total: roomServiceFee,
    })
  }
  if (takeawayFee > 0) {
    linesToInsert.push({
      item_id: '',
      item_name: OUTLET_FEE_LINE_NAMES.takeaway,
      qty: 1,
      unit_price: takeawayFee,
      line_total: takeawayFee,
    })
  }

  const { error: le } = await admin.from('outlet_order_lines').insert(
    linesToInsert.map((ol) => ({
      order_id: order.id,
      item_id: ol.item_id || null,
      item_name: ol.item_name,
      qty: ol.qty,
      unit_price: ol.unit_price,
      line_total: ol.line_total,
    })),
  )
  if (le) throw new Error(le.message)

  if (input.settleNow) {
    return settleOutletOrderRecord(admin, {
      organizationId: input.organizationId,
      userId: input.userId,
      orderId: order.id,
      paymentMethod: isComplimentary ? 'complimentary' : input.paymentMethod,
      bookingId: input.bookingId,
      cityLedgerAccountId: input.cityLedgerAccountId,
      guestName: input.guestName,
      roomNumber: input.roomNumber,
    })
  }

  return {
    order: { ...order, outlet_order_lines: linesToInsert },
    lines: linesToInsert,
  }
}
