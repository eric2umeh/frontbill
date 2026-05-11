import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canonicalRoleKey } from '@/lib/permissions'

function canProcessRefunds(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'superadmin' || k === 'admin' || k === 'manager' || k === 'accountant'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const start = searchParams.get('start_date')
    const end = searchParams.get('end_date')

    if (!callerId) return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: prof, error: pe } = await admin.from('profiles').select('organization_id, role').eq('id', callerId).single()
    if (pe || !prof?.organization_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!canProcessRefunds(prof.role)) {
      return NextResponse.json({ error: 'You do not have access to refunds' }, { status: 403 })
    }

    let q = admin
      .from('refunds')
      .select('*, guests(name, phone)')
      .eq('organization_id', prof.organization_id)
      .order('refund_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (start) q = q.gte('refund_date', start)
    if (end) q = q.lte('refund_date', end)

    const { data, error } = await q
    if (error) {
      if (/refunds/i.test(error.message) && /does not exist/i.test(error.message)) {
        return NextResponse.json({ refunds: [] })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ refunds: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, guest_id, booking_id, amount, reason, refund_date, reference_payment_date } = body

    if (!caller_id || !guest_id || !amount || !reason?.trim() || !refund_date) {
      return NextResponse.json(
        { error: 'caller_id, guest_id, amount, reason and refund_date are required' },
        { status: 400 },
      )
    }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof, error: pe } = await admin.from('profiles').select('organization_id, role').eq('id', caller_id).single()
    if (pe || !prof?.organization_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!canProcessRefunds(prof.role)) {
      return NextResponse.json({ error: 'You are not allowed to record refunds' }, { status: 403 })
    }

    const orgId = prof.organization_id

    const { data: guest, error: ge } = await admin
      .from('guests')
      .select('id, organization_id, balance, name')
      .eq('id', guest_id)
      .single()
    if (ge || !guest || guest.organization_id !== orgId) {
      return NextResponse.json({ error: 'Guest not found in this hotel' }, { status: 404 })
    }

    if (booking_id) {
      const { data: bk, error: be } = await admin
        .from('bookings')
        .select('id, organization_id, deposit, balance')
        .eq('id', booking_id)
        .single()
      if (be || !bk || bk.organization_id !== orgId) {
        return NextResponse.json({ error: 'Booking not found in this hotel' }, { status: 404 })
      }
    }

    const { data: inserted, error: insE } = await admin
      .from('refunds')
      .insert([
        {
          organization_id: orgId,
          guest_id,
          booking_id: booking_id || null,
          amount: amt,
          reason: String(reason).trim(),
          refund_date: String(refund_date).slice(0, 10),
          reference_payment_date: reference_payment_date ? String(reference_payment_date).slice(0, 10) : null,
          processed_by: caller_id,
        },
      ])
      .select()
      .single()

    if (insE) {
      if (/refunds/i.test(insE.message) && /does not exist/i.test(insE.message)) {
        return NextResponse.json(
          { error: 'Refunds table missing — run scripts/040_reporting_refunds_discount_category.sql' },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: insE.message }, { status: 500 })
    }

    const prevBal = Number(guest.balance) || 0
    const nextBal = Math.max(0, prevBal - amt)
    await admin.from('guests').update({ balance: nextBal }).eq('id', guest_id)

    if (booking_id) {
      const { data: bk } = await admin.from('bookings').select('deposit, balance').eq('id', booking_id).single()
      if (bk) {
        const dep = Number(bk.deposit) || 0
        const bal = Number(bk.balance) || 0
        const depNext = Math.max(0, dep - amt)
        const remainder = Math.max(0, amt - dep)
        const balNext = Math.max(0, bal - remainder)
        await admin.from('bookings').update({ deposit: depNext, balance: balNext }).eq('id', booking_id)
      }
    }

    return NextResponse.json({ refund: inserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
