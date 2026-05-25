import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'
import { canRequestExtendStayDiscount } from '@/lib/utils/booking-checkout-ui'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'
import { notifyNightAuditRequestCreated } from '@/lib/night-audit/notify-request-created'

const DECISION = ['approved', 'rejected'] as const

function isDecider(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'superadmin' || k === 'admin' || k === 'manager'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    if (!callerId) return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: prof, error: pe } = await admin.from('profiles').select('organization_id, role').eq('id', callerId).single()
    if (pe || !prof?.organization_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let q = admin
      .from('extend_stay_discount_requests')
      .select('*')
      .eq('organization_id', prof.organization_id)
      .order('created_at', { ascending: false })

    if (!isDecider(prof.role)) {
      q = q.eq('requested_by', callerId)
    }

    const { data: rows, error } = await q
    if (error) {
      if (/extend_stay_discount_requests/i.test(error.message) && /does not exist/i.test(error.message)) {
        return NextResponse.json({ requests: [] })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = Array.from(new Set((rows || []).flatMap((r: any) => [r.requested_by, r.approved_by]).filter(Boolean)))
    const names: Record<string, string> = {}
    if (ids.length) {
      const { data: ps } = await admin.from('profiles').select('id, full_name').in('id', ids)
      ;(ps || []).forEach((p: any) => {
        names[p.id] = String(p.full_name || '').trim() || p.id.slice(0, 8)
      })
    }

    return NextResponse.json({
      requests: (rows || []).map((r: any) => ({
        ...r,
        requested_by_name: names[r.requested_by] || '—',
        approved_by_name: r.approved_by ? names[r.approved_by] : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      caller_id,
      booking_id,
      new_check_out,
      additional_nights,
      discounted_total,
      payment_method,
      ledger_account_id,
      ledger_account_type,
      reason,
    } = body

    if (!caller_id || !booking_id || !new_check_out || !reason?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin.from('profiles').select('organization_id, role').eq('id', caller_id).single()
    if (!prof?.organization_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!hasPermission(prof.role, 'bookings:checkin')) {
      return NextResponse.json({ error: 'Only front-office roles can request a discounted extension' }, { status: 403 })
    }

    const nights = Math.max(1, Number(additional_nights) || 0)
    const { data: booking } = await admin
      .from('bookings')
      .select('id, organization_id, status, folio_status, guest_id, rate_per_night, check_out')
      .eq('id', booking_id)
      .single()
    if (!booking || booking.organization_id !== prof.organization_id) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (!canRequestExtendStayDiscount(booking)) {
      return NextResponse.json(
        {
          error:
            'Discounted extensions are only for in-house folios (reserved, confirmed, or checked-in). If the guest is in the room but status is still confirmed, use Check In first or extend at standard rate.',
        },
        { status: 400 },
      )
    }

    const rate = Number(booking.rate_per_night) || 0
    const std = rate * nights
    const disc = Number(discounted_total)
    if (!Number.isFinite(disc) || disc <= 0 || disc >= std) {
      return NextResponse.json(
        { error: `Discounted total must be greater than 0 and less than server-calculated standard (${std})` },
        { status: 400 },
      )
    }
    const discountAmount = std - disc

    const currentCo = String(booking.check_out || '').slice(0, 10)
    const newCo = String(new_check_out).slice(0, 10)
    if (newCo <= currentCo) {
      return NextResponse.json({ error: 'New checkout must be after the current checkout date' }, { status: 400 })
    }

    const { data: inserted, error: insE } = await admin
      .from('extend_stay_discount_requests')
      .insert([
        {
          organization_id: prof.organization_id,
          booking_id,
          requested_by: caller_id,
          new_check_out: String(new_check_out).slice(0, 10),
          additional_nights: nights,
          standard_total: std,
          discounted_total: disc,
          discount_amount: discountAmount,
          payment_method: String(payment_method || 'cash'),
          ledger_account_id: ledger_account_id || null,
          ledger_account_type: ledger_account_type || null,
          reason: String(reason).trim(),
        },
      ])
      .select()
      .single()

    if (insE) {
      if (insE.code === '23505') {
        return NextResponse.json({ error: 'A pending discount request already exists for this booking' }, { status: 409 })
      }
      return NextResponse.json({ error: insE.message }, { status: 500 })
    }

    void notifyNightAuditRequestCreated(admin, {
      organizationId: prof.organization_id,
      callerId: caller_id,
      kind: 'extend_discount',
      requestId: inserted.id,
      reason: String(reason).trim(),
      detailLines: [
        { label: 'New checkout', value: newCo },
        { label: 'Nights', value: String(nights) },
        { label: 'Discounted total', value: String(disc) },
      ],
    })

    return NextResponse.json({ request: inserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { caller_id, request_id, status, decision_note } = await request.json()
    if (!caller_id || !request_id || !DECISION.includes(status)) {
      return NextResponse.json({ error: 'caller_id, request_id and status required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin.from('profiles').select('organization_id, role').eq('id', caller_id).single()
    if (!prof?.organization_id || !isDecider(prof.role)) {
      return NextResponse.json({ error: 'Only Superadmin, Administrator, or Manager can decide' }, { status: 403 })
    }

    const { data: row, error: le } = await admin.from('extend_stay_discount_requests').select('*').eq('id', request_id).single()
    if (le || !row || row.organization_id !== prof.organization_id) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (row.status !== 'pending') {
      return NextResponse.json({ error: 'Already decided' }, { status: 400 })
    }

    const decidedAt = new Date().toISOString()

    if (status === 'rejected') {
      const { data: updated, error: ue } = await admin
        .from('extend_stay_discount_requests')
        .update({
          status: 'rejected',
          approved_by: caller_id,
          decided_at: decidedAt,
          decision_note: decision_note?.trim() || null,
        })
        .eq('id', request_id)
        .select()
        .single()
      if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })
      return NextResponse.json({ request: updated })
    }

    const pm = String(row.payment_method || 'cash').toLowerCase()
    if (pm === 'city_ledger') {
      return NextResponse.json(
        { error: 'Approve discounted extensions with city ledger from the booking UI after rejection, or implement ledger in a follow-up.' },
        { status: 400 },
      )
    }

    const { data: booking } = await admin
      .from('bookings')
      .select('id, deposit, balance, guest_id, folio_id, organization_id')
      .eq('id', row.booking_id)
      .single()
    if (!booking) return NextResponse.json({ error: 'Booking missing' }, { status: 400 })

    const discTotal = Number(row.discounted_total) || 0
    const nights = Number(row.additional_nights) || 0
    const approverLabel = (await admin.from('profiles').select('full_name').eq('id', caller_id).maybeSingle()).data
      ?.full_name || caller_id.slice(0, 8)

    const folioRow: Record<string, unknown> = {
      booking_id: row.booking_id,
      description: `Extended Stay — ${nights} night(s) (DISCOUNTED). Approved by ${approverLabel}. ${String(row.reason || '').slice(0, 200)}`,
      amount: discTotal,
      charge_type: 'extended_stay',
      payment_method: row.payment_method,
      payment_status: 'paid',
      created_by: caller_id,
    }
    if (booking.organization_id) folioRow.organization_id = booking.organization_id

    const { error: fcErr } = await insertFolioCharges(admin, [folioRow])
    if (fcErr) return NextResponse.json({ error: fcErr.message }, { status: 500 })

    await admin
      .from('bookings')
      .update({
        check_out: row.new_check_out,
        deposit: (Number(booking.deposit) || 0) + discTotal,
      })
      .eq('id', row.booking_id)

    const { data: updated, error: ue } = await admin
      .from('extend_stay_discount_requests')
      .update({
        status: 'approved',
        approved_by: caller_id,
        decided_at: decidedAt,
        decision_note: decision_note?.trim() || 'Approved',
      })
      .eq('id', request_id)
      .select()
      .single()
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

    return NextResponse.json({ request: updated, booking_id: row.booking_id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
