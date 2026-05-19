import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed, nextOrderNumber } from '@/lib/outlets/api-auth'
import { canAccessOutletDepartment } from '@/lib/outlets/access'
import { isOutletDepartmentKey, getOutletDepartment } from '@/lib/outlets/departments'
import { findActiveBookingByRoom } from '@/lib/outlets/find-active-booking'
import { postOutletCityLedgerCharge } from '@/lib/outlets/post-outlet-city-ledger'

type OrderLineInput = { item_id: string; qty: number }

function isCityLedgerPayment(method: string) {
  return method === 'city_ledger' || method === 'room_charge'
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const department = params.get('department') || ''
  if (!isOutletDepartmentKey(department)) {
    return NextResponse.json({ error: 'department required' }, { status: 400 })
  }
  const auth = await resolveOutletAuthed(request, { department, permission: 'outlet:view' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const dateFrom = params.get('from')
  const dateTo = params.get('to')

  let q = admin
    .from('outlet_orders')
    .select('*, outlet_order_lines(*)')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)
    .order('created_at', { ascending: false })
    .limit(200)

  if (dateFrom) q = q.gte('created_at', dateFrom)
  if (dateTo) q = q.lte('created_at', dateTo)

  const status = params.get('status')
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ orders: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await resolveOutletAuthed(request, { permission: 'outlet:sell' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const department = body?.department as string
  const lines = body?.lines as OrderLineInput[] | undefined
  const rawPaymentMethod = String(body?.payment_method || 'cash').trim()
  const paymentMethod = isCityLedgerPayment(rawPaymentMethod) ? 'city_ledger' : rawPaymentMethod
  let bookingId = (body?.booking_id as string | undefined)?.trim() || null
  const cityLedgerAccountId = (body?.city_ledger_account_id as string | undefined)?.trim() || null
  const roomNumber = (body?.room_number as string | undefined)?.trim() || null
  const guestName = (body?.guest_name as string | undefined)?.trim() || null

  if (!isOutletDepartmentKey(department) || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'department and lines[] required' }, { status: 400 })
  }
  if (!canAccessOutletDepartment(auth.ctx.role, department)) {
    return NextResponse.json({ error: 'No access' }, { status: 403 })
  }

  const admin = createAdminClient()
  const itemIds = lines.map((l) => l.item_id).filter(Boolean)
  const { data: items, error: ie } = await admin
    .from('outlet_menu_items')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)
    .in('id', itemIds)

  if (ie) return NextResponse.json({ error: ie.message }, { status: 400 })
  const byId = new Map((items ?? []).map((i) => [i.id, i]))

  const orderLines: {
    item_id: string
    item_name: string
    qty: number
    unit_price: number
    line_total: number
  }[] = []
  let subtotal = 0

  for (const l of lines) {
    const item = byId.get(l.item_id)
    const qty = Number(l.qty)
    if (!item || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: `Invalid line for item ${l.item_id}` }, { status: 400 })
    }
    const unitPrice = Number(item.unit_price)
    const lineTotal = Math.round(unitPrice * qty * 100) / 100
    subtotal += lineTotal
    orderLines.push({
      item_id: item.id,
      item_name: item.name,
      qty,
      unit_price: unitPrice,
      line_total: lineTotal,
    })
  }

  subtotal = Math.round(subtotal * 100) / 100
  const deptDef = getOutletDepartment(department)
  const orderNumber = nextOrderNumber(department)
  const lineDetail = orderLines.map((l) => `${l.item_name} ×${l.qty}`).join(', ')

  if (paymentMethod === 'city_ledger') {
    if (!bookingId && roomNumber) {
      const found = await findActiveBookingByRoom(admin, auth.ctx.organizationId, roomNumber)
      if (found) bookingId = found.id
    }
    if (!bookingId && !cityLedgerAccountId && !guestName) {
      return NextResponse.json(
        { error: 'Room with check-in guest, guest name, or city ledger account required' },
        { status: 400 },
      )
    }
  }

  const { data: order, error: oe } = await admin
    .from('outlet_orders')
    .insert({
      organization_id: auth.ctx.organizationId,
      department,
      order_number: orderNumber,
      status: 'settled',
      order_type: body?.order_type || 'takeaway',
      guest_name: guestName || null,
      room_number: roomNumber || null,
      table_label: body?.table_label || null,
      booking_id: bookingId || null,
      subtotal,
      payment_method: paymentMethod,
      notes: body?.notes || null,
      created_by: auth.ctx.userId,
      settled_by: auth.ctx.userId,
      settled_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (oe || !order) return NextResponse.json({ error: oe?.message || 'Order failed' }, { status: 400 })

  const { error: le } = await admin.from('outlet_order_lines').insert(
    orderLines.map((ol) => ({ ...ol, order_id: order.id })),
  )
  if (le) return NextResponse.json({ error: le.message }, { status: 400 })

  let folioChargeId: string | null = null
  let ledgerAccountId: string | null = null

  if (paymentMethod === 'city_ledger') {
    try {
      const result = await postOutletCityLedgerCharge(admin, {
        organizationId: auth.ctx.organizationId,
        userId: auth.ctx.userId,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'City ledger posting failed'
      await admin.from('outlet_orders').update({ status: 'void', void_reason: msg }).eq('id', order.id)
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  } else {
    const { data: booking } = bookingId
      ? await admin.from('bookings').select('guest_id').eq('id', bookingId).maybeSingle()
      : { data: null }
    await admin.from('payments').insert({
      organization_id: auth.ctx.organizationId,
      booking_id: bookingId || null,
      guest_id: booking?.guest_id ?? null,
      amount: subtotal,
      payment_method: paymentMethod,
      payment_date: new Date().toISOString(),
      notes: `${deptDef?.label ?? department} ${orderNumber} — ${lineDetail}`.slice(0, 500),
      received_by: auth.ctx.userId,
    })
  }

  const orderPatch: Record<string, unknown> = {}
  if (folioChargeId) orderPatch.folio_charge_id = folioChargeId
  if (ledgerAccountId) orderPatch.city_ledger_account_id = ledgerAccountId
  if (bookingId) orderPatch.booking_id = bookingId
  if (Object.keys(orderPatch).length > 0) {
    await admin.from('outlet_orders').update(orderPatch).eq('id', order.id)
  }

  return NextResponse.json({
    ok: true,
    order: {
      ...order,
      ...orderPatch,
      outlet_order_lines: orderLines,
    },
  })
}
