import type { SupabaseClient } from '@supabase/supabase-js'
import { getOutletDepartment } from '@/lib/outlets/departments'
import { buildOutletFolioDescription } from '@/lib/outlets/booking-folio'
import {
  OUTLET_FEE_LINE_NAMES,
  parseOutletOrderExtraFees,
} from '@/lib/outlets/order-extra-fees'
import { isOutletOrderType } from '@/lib/outlets/order-types'
import { reverseOutletOrderSettlement } from '@/lib/outlets/reverse-outlet-order-settlement'

const FEE_NAMES = new Set<string>([
  OUTLET_FEE_LINE_NAMES.roomService,
  OUTLET_FEE_LINE_NAMES.takeaway,
])

export type OutletOrderLineInput = {
  item_id?: string | null
  item_name: string
  qty: number
  unit_price: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function isFeeLineName(name: string): boolean {
  return FEE_NAMES.has(name.trim())
}

function productLinesFromOrder(lines: Array<{ item_name: string; qty: number; unit_price: number; line_total?: number }>) {
  return lines.filter((l) => !isFeeLineName(String(l.item_name)))
}

async function removeOpenOutletFolioCharge(
  admin: SupabaseClient,
  folioChargeId: string,
  bookingId: string | null,
): Promise<void> {
  const { data: fc } = await admin
    .from('folio_charges')
    .select('amount')
    .eq('id', folioChargeId)
    .maybeSingle()

  await admin.from('folio_charges').delete().eq('id', folioChargeId)

  if (bookingId && fc) {
    const amount = Number(fc.amount) || 0
    const { data: bk } = await admin
      .from('bookings')
      .select('balance')
      .eq('id', bookingId)
      .maybeSingle()
    const newBalance = Math.max(0, roundMoney((Number(bk?.balance) || 0) - amount))
    await admin.from('bookings').update({ balance: newBalance }).eq('id', bookingId)
  }
}

async function syncOpenOutletFolioCharge(
  admin: SupabaseClient,
  input: {
    folioChargeId: string
    bookingId: string
    organizationId: string
    department: string
    orderNumber: string
    newAmount: number
    lineDetail: string
  },
): Promise<void> {
  const { data: fc } = await admin
    .from('folio_charges')
    .select('amount')
    .eq('id', input.folioChargeId)
    .maybeSingle()
  const oldAmount = Number(fc?.amount) || 0
  const dept = getOutletDepartment(input.department)
  const description = buildOutletFolioDescription(
    dept?.label ?? input.department,
    input.lineDetail,
    input.orderNumber,
  )

  await admin
    .from('folio_charges')
    .update({ amount: input.newAmount, description })
    .eq('id', input.folioChargeId)

  const delta = roundMoney(input.newAmount - oldAmount)
  if (delta !== 0) {
    const { data: bk } = await admin
      .from('bookings')
      .select('balance')
      .eq('id', input.bookingId)
      .maybeSingle()
    const newBalance = roundMoney((Number(bk?.balance) || 0) + delta)
    await admin.from('bookings').update({ balance: newBalance }).eq('id', input.bookingId)
  }
}

function buildLinesToInsert(
  productLines: OutletOrderLineInput[],
  roomServiceFee: number,
  takeawayFee: number,
): Array<{
  item_id: string | null
  item_name: string
  qty: number
  unit_price: number
  line_total: number
}> {
  const rows = productLines.map((l) => {
    const qty = Number(l.qty)
    const unit = Number(l.unit_price)
    return {
      item_id: l.item_id?.trim() || null,
      item_name: String(l.item_name).trim(),
      qty,
      unit_price: unit,
      line_total: roundMoney(qty * unit),
    }
  })
  if (roomServiceFee > 0) {
    rows.push({
      item_id: null,
      item_name: OUTLET_FEE_LINE_NAMES.roomService,
      qty: 1,
      unit_price: roomServiceFee,
      line_total: roomServiceFee,
    })
  }
  if (takeawayFee > 0) {
    rows.push({
      item_id: null,
      item_name: OUTLET_FEE_LINE_NAMES.takeaway,
      qty: 1,
      unit_price: takeawayFee,
      line_total: takeawayFee,
    })
  }
  return rows
}

export async function updateOutletOrder(
  admin: SupabaseClient,
  input: {
    organizationId: string
    orderId: string
    guestName?: string | null
    roomNumber?: string | null
    tableLabel?: string | null
    notes?: string | null
    waiterName?: string | null
    orderType?: string | null
    roomServiceFee?: unknown
    takeawayFee?: unknown
    lines?: OutletOrderLineInput[] | null
  },
): Promise<Record<string, unknown>> {
  const { data: order, error: loadErr } = await admin
    .from('outlet_orders')
    .select('*, outlet_order_lines(*)')
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (loadErr || !order) throw new Error(loadErr?.message || 'Order not found')
  if (order.status === 'void') throw new Error('Void orders cannot be edited')

  const patch: Record<string, unknown> = {}
  if (input.guestName !== undefined) patch.guest_name = input.guestName?.trim() || null
  if (input.roomNumber !== undefined) patch.room_number = input.roomNumber?.trim() || null
  if (input.tableLabel !== undefined) patch.table_label = input.tableLabel?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (input.waiterName !== undefined) patch.waiter_name = input.waiterName?.trim() || null

  const isOpen = order.status === 'open'

  if (isOpen) {
    if (input.orderType !== undefined && input.orderType !== null) {
      const ot = String(input.orderType).trim()
      if (!isOutletOrderType(ot)) throw new Error('Invalid order type')
      patch.order_type = ot
    }

    const orderType = String(patch.order_type ?? order.order_type)
    const feeParse = parseOutletOrderExtraFees(orderType, {
      room_service_fee: input.roomServiceFee ?? order.room_service_fee,
      takeaway_fee: input.takeawayFee ?? order.takeaway_fee,
    })
    if (feeParse.error) throw new Error(feeParse.error)
    const { roomServiceFee, takeawayFee } = feeParse.fees
    patch.room_service_fee = roomServiceFee
    patch.takeaway_fee = takeawayFee

    if (input.lines != null) {
      if (!Array.isArray(input.lines) || input.lines.length === 0) {
        throw new Error('At least one line item is required')
      }
      for (const l of input.lines) {
        const qty = Number(l.qty)
        const price = Number(l.unit_price)
        if (!l.item_name?.trim()) throw new Error('Each line needs an item name')
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Invalid quantity on a line')
        if (!Number.isFinite(price) || price < 0) throw new Error('Invalid price on a line')
      }

      const chargeSubtotal = roundMoney(
        input.lines.reduce((s, l) => s + roundMoney(Number(l.qty) * Number(l.unit_price)), 0),
      )
      patch.subtotal = chargeSubtotal

      const linesToInsert = buildLinesToInsert(input.lines, roomServiceFee, takeawayFee)
      await admin.from('outlet_order_lines').delete().eq('order_id', input.orderId)
      const { error: le } = await admin.from('outlet_order_lines').insert(
        linesToInsert.map((ol) => ({
          order_id: input.orderId,
          item_id: ol.item_id,
          item_name: ol.item_name,
          qty: ol.qty,
          unit_price: ol.unit_price,
          line_total: ol.line_total,
        })),
      )
      if (le) throw new Error(le.message)

      const lineDetail = input.lines.map((l) => `${l.item_name} ×${l.qty}`).join(', ')
      if (
        order.folio_charge_id &&
        order.booking_id &&
        chargeSubtotal > 0 &&
        !order.is_complimentary
      ) {
        await syncOpenOutletFolioCharge(admin, {
          folioChargeId: order.folio_charge_id,
          bookingId: order.booking_id,
          organizationId: input.organizationId,
          department: String(order.department),
          orderNumber: String(order.order_number),
          newAmount: chargeSubtotal,
          lineDetail,
        })
      } else if (order.folio_charge_id && chargeSubtotal <= 0) {
        await removeOpenOutletFolioCharge(admin, order.folio_charge_id, order.booking_id)
        patch.folio_charge_id = null
      }
    } else if (input.roomServiceFee !== undefined || input.takeawayFee !== undefined) {
      const existingProducts = productLinesFromOrder(
        (order.outlet_order_lines ?? []) as Array<{
          item_name: string
          qty: number
          unit_price: number
        }>,
      )
      const chargeSubtotal = roundMoney(
        existingProducts.reduce(
          (s, l) => s + roundMoney(Number(l.qty) * Number(l.unit_price)),
          0,
        ),
      )
      const linesToInsert = buildLinesToInsert(
        existingProducts.map((l) => ({
          item_id: null,
          item_name: l.item_name,
          qty: Number(l.qty),
          unit_price: Number(l.unit_price),
        })),
        roomServiceFee,
        takeawayFee,
      )
      await admin.from('outlet_order_lines').delete().eq('order_id', input.orderId)
      await admin.from('outlet_order_lines').insert(
        linesToInsert.map((ol) => ({
          order_id: input.orderId,
          item_id: ol.item_id,
          item_name: ol.item_name,
          qty: ol.qty,
          unit_price: ol.unit_price,
          line_total: ol.line_total,
        })),
      )
    }
  } else if (
    input.lines != null ||
    input.orderType !== undefined ||
    input.roomServiceFee !== undefined ||
    input.takeawayFee !== undefined
  ) {
    throw new Error('Settled orders: only guest, room, table, notes, and waiter can be changed')
  }

  if (Object.keys(patch).length > 0) {
    const { error: ue } = await admin
      .from('outlet_orders')
      .update(patch)
      .eq('id', input.orderId)
    if (ue) throw new Error(ue.message)
  }

  const { data: updated, error: re } = await admin
    .from('outlet_orders')
    .select('*, outlet_order_lines(*)')
    .eq('id', input.orderId)
    .single()
  if (re || !updated) throw new Error(re?.message || 'Could not reload order')
  return updated as Record<string, unknown>
}

export async function deleteOrVoidOutletOrder(
  admin: SupabaseClient,
  input: {
    organizationId: string
    orderId: string
    userId: string
    reason?: string | null
  },
): Promise<{ deleted: boolean }> {
  const { data: order, error: loadErr } = await admin
    .from('outlet_orders')
    .select(
      '*, outlet_order_lines(item_name, qty)',
    )
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (loadErr || !order) throw new Error(loadErr?.message || 'Order not found')
  if (order.status === 'void') throw new Error('Order is already void')

  if (order.status === 'open') {
    if (order.folio_charge_id) {
      await removeOpenOutletFolioCharge(
        admin,
        order.folio_charge_id,
        order.booking_id as string | null,
      )
    }
    const { error: de } = await admin.from('outlet_orders').delete().eq('id', input.orderId)
    if (de) throw new Error(de.message)
    return { deleted: true }
  }

  const reason = input.reason?.trim()
  if (!reason) throw new Error('A reason is required to void a settled order')

  await reverseOutletOrderSettlement(admin, {
    organizationId: input.organizationId,
    order: order as {
      id: string
      order_number: string
      department: string
      subtotal: number | string
      payment_method: string | null
      booking_id: string | null
      folio_charge_id: string | null
      city_ledger_account_id?: string | null
      payment_id?: string | null
      is_complimentary?: boolean | null
      outlet_order_lines?: Array<{ item_name: string; qty: number }> | null
    },
    voidReason: reason,
  })

  const { error: ve } = await admin
    .from('outlet_orders')
    .update({
      status: 'void',
      voided_at: new Date().toISOString(),
      void_reason: reason,
    })
    .eq('id', input.orderId)
  if (ve) throw new Error(ve.message)
  return { deleted: false }
}
