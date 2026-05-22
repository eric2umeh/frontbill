import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { settleOutletOrderRecord } from '@/lib/outlets/settle-outlet-order'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await resolveOutletAuthed(request, { permission: 'outlet:sell' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const paymentMethod = String(body?.payment_method || 'cash').trim()
  if (!paymentMethod) {
    return NextResponse.json({ error: 'payment_method required' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const result = await settleOutletOrderRecord(admin, {
      organizationId: auth.ctx.organizationId,
      userId: auth.ctx.userId,
      orderId: id,
      paymentMethod,
      bookingId: body?.booking_id ?? null,
      cityLedgerAccountId: body?.city_ledger_account_id ?? null,
      guestName: body?.guest_name ?? null,
      roomNumber: body?.room_number ?? null,
    })
    return NextResponse.json({ ok: true, order: result.order })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Settle failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
