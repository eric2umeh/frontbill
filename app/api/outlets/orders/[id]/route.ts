import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletOrderManage } from '@/lib/outlets/api-auth'
import { hasPermission } from '@/lib/permissions'
import {
  deleteOrVoidOutletOrder,
  updateOutletOrder,
  type OutletOrderLineInput,
} from '@/lib/outlets/mutate-outlet-order'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const admin = createAdminClient()

  const { data: probe, error: pe } = await admin
    .from('outlet_orders')
    .select('department, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (pe || !probe?.department) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const auth = await resolveOutletOrderManage(request, {
    department: String(probe.department),
  })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!hasPermission(auth.ctx.role, 'outlet:edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (probe.organization_id !== auth.ctx.organizationId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  try {
    const order = await updateOutletOrder(admin, {
      organizationId: auth.ctx.organizationId,
      orderId: id,
      guestName: body?.guest_name,
      roomNumber: body?.room_number,
      tableLabel: body?.table_label,
      notes: body?.notes,
      waiterName: body?.waiter_name,
      orderType: body?.order_type,
      roomServiceFee: body?.room_service_fee,
      takeawayFee: body?.takeaway_fee,
      lines: body?.lines as OutletOrderLineInput[] | undefined,
    })
    return NextResponse.json({ ok: true, order })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const admin = createAdminClient()

  const { data: probe, error: pe } = await admin
    .from('outlet_orders')
    .select('department, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (pe || !probe?.department) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const auth = await resolveOutletOrderManage(request, {
    department: String(probe.department),
  })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!hasPermission(auth.ctx.role, 'outlet:delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (probe.organization_id !== auth.ctx.organizationId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  try {
    const result = await deleteOrVoidOutletOrder(admin, {
      organizationId: auth.ctx.organizationId,
      orderId: id,
      userId: auth.ctx.userId,
      reason: body?.reason ?? body?.void_reason,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
