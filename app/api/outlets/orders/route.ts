import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed, nextOrderNumber } from '@/lib/outlets/api-auth'
import { canAccessOutletDepartment } from '@/lib/outlets/access'
import { isOutletDepartmentKey, getOutletDepartment } from '@/lib/outlets/departments'
import { parseOutletOrderExtraFees } from '@/lib/outlets/order-extra-fees'
import {
  hasOutletCityLedgerChargeTarget,
  resolveOutletCustomerContext,
} from '@/lib/outlets/resolve-outlet-customer'
import {
  hasOutletCityLedgerChargeTarget,
  resolveOutletCustomerContext,
} from '@/lib/outlets/resolve-outlet-customer'
import { createOutletOrderRecord } from '@/lib/outlets/settle-outlet-order'

type OrderLineInput = { item_id: string; qty: number }

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
  const isComplimentary = body?.is_complimentary === true
  const billOnly = body?.bill_only === true
  const settleNow = billOnly ? false : body?.settle_now !== false
  const cityLedgerAccountId = (body?.city_ledger_account_id as string | undefined)?.trim() || null
  const roomNumber = (body?.room_number as string | undefined)?.trim() || null
  const guestNameInput = (body?.guest_name as string | undefined)?.trim() || null
  let bookingId = (body?.booking_id as string | undefined)?.trim() || null

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
  let itemsSubtotal = 0

  for (const l of lines) {
    const item = byId.get(l.item_id)
    const qty = Number(l.qty)
    if (!item || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: `Invalid line for item ${l.item_id}` }, { status: 400 })
    }
    const unitPrice = Number(item.unit_price)
    const lineTotal = Math.round(unitPrice * qty * 100) / 100
    itemsSubtotal += lineTotal
    orderLines.push({
      item_id: item.id,
      item_name: item.name,
      qty,
      unit_price: unitPrice,
      line_total: lineTotal,
    })
  }

  itemsSubtotal = Math.round(itemsSubtotal * 100) / 100
  const orderType = String(body?.order_type || 'takeaway').trim()
  const feeResult = parseOutletOrderExtraFees(orderType, body)
  if (feeResult.error) {
    return NextResponse.json({ error: feeResult.error }, { status: 400 })
  }
  const { roomServiceFee, takeawayFee, extraFeesTotal } = feeResult.fees
  const subtotal = Math.round((itemsSubtotal + extraFeesTotal) * 100) / 100
  const orderNumber = nextOrderNumber(department)

  const resolvedCustomer = await resolveOutletCustomerContext(admin, auth.ctx.organizationId, {
    bookingId,
    guestName: guestNameInput,
    roomNumber,
  })
  bookingId = resolvedCustomer.bookingId
  const guestName = resolvedCustomer.guestName

  if (!isComplimentary && settleNow && rawPaymentMethod === 'city_ledger') {
    if (!hasOutletCityLedgerChargeTarget(resolvedCustomer, cityLedgerAccountId)) {
      return NextResponse.json(
        {
          error:
            'In-house room with active stay, guest name, or city ledger account required to charge to room',
        },
        { status: 400 },
      )
    }
  }

  try {
    const result = await createOutletOrderRecord(admin, {
      organizationId: auth.ctx.organizationId,
      userId: auth.ctx.userId,
      department,
      orderNumber,
      orderType,
      guestName,
      roomNumber: resolvedCustomer.roomNumber,
      tableLabel: body?.table_label || null,
      bookingId,
      subtotal,
      roomServiceFee,
      takeawayFee,
      paymentMethod: rawPaymentMethod,
      notes: body?.notes || null,
      orderLines,
      settleNow,
      cityLedgerAccountId,
      isComplimentary,
    })

    return NextResponse.json({
      ok: true,
      order: result.order,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Order failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
