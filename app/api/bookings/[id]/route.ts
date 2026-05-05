import { createAdminClient } from '@/lib/supabase/admin'
import {
  editBookingPatchSchema,
  mergeBookingPatch,
  roomHousekeepingAfterEdit,
} from '@/lib/booking/edit-booking-patch'
import { DEFAULT_ORG_CHECKOUT_TIME, folioGuestActionsLocked } from '@/lib/utils/booking-checkout-ui'
import { NextResponse } from 'next/server'

const ADMIN_ROLES = new Set(['superadmin', 'admin'])

async function loadCaller(admin: ReturnType<typeof createAdminClient>, callerId: string) {
  const { data: profile, error } = await admin.from('profiles').select('role, organization_id').eq('id', callerId).single()
  if (error || !profile?.organization_id) return null
  return profile as { role: string; organization_id: string }
}

/** Overlapping active stays on the same room (excluding one booking). */
async function hasRoomDateConflict(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId: string,
): Promise<boolean> {
  const { data: rows, error } = await admin
    .from('bookings')
    .select('id, check_in, check_out, status, folio_status')
    .eq('organization_id', orgId)
    .eq('room_id', roomId)
    .neq('id', excludeBookingId)

  if (error) throw new Error(error.message)

  for (const row of rows || []) {
    const st = String((row as { status?: string }).status || '').toLowerCase()
    const fs = String((row as { folio_status?: string }).folio_status || '').toLowerCase()
    if (st === 'cancelled' || st === 'checked_out') continue
    if (fs === 'checked_out') continue
    const oi = (row as { check_in: string }).check_in
    const oo = (row as { check_out: string }).check_out
    if (oi < checkOut && oo > checkIn) return true
  }
  return false
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookingId } = await ctx.params
    const body = await request.json()
    const caller_id = body?.caller_id as string | undefined
    const rawPatch = body?.patch

    if (!caller_id || !rawPatch || typeof rawPatch !== 'object') {
      return NextResponse.json({ error: 'caller_id and patch object are required' }, { status: 400 })
    }

    const parsed = editBookingPatchSchema.safeParse(rawPatch)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'patch must include at least one field' }, { status: 400 })
    }

    const admin = createAdminClient()
    const caller = await loadCaller(admin, caller_id)
    if (!caller || !ADMIN_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: existing, error: loadErr } = await admin.from('bookings').select('*').eq('id', bookingId).single()
    if (loadErr || !existing) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if ((existing as { organization_id: string }).organization_id !== caller.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: orgRow } = await admin
      .from('organizations')
      .select('checkout_time')
      .eq('id', (existing as { organization_id: string }).organization_id)
      .maybeSingle()
    const checkoutClock = orgRow?.checkout_time ?? DEFAULT_ORG_CHECKOUT_TIME

    const ex = existing as {
      status: string
      check_in: string
      check_out: string
      folio_status?: string | null
    }
    if (
      folioGuestActionsLocked(
        {
          status: ex.status,
          check_in: ex.check_in,
          check_out: ex.check_out,
          folio_status: ex.folio_status,
        },
        checkoutClock,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Cannot edit this booking once the guest has checked out or after the organization checkout time on the checkout date.',
        },
        { status: 400 },
      )
    }

    let merged: ReturnType<typeof mergeBookingPatch>
    try {
      merged = mergeBookingPatch(existing as Record<string, unknown>, parsed.data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Invalid dates'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const prevRoomId = (existing as { room_id: string }).room_id
    const prevCi = (existing as { check_in: string }).check_in
    const prevCo = (existing as { check_out: string }).check_out

    const scheduleOrRoomChanged =
      merged.room_id !== prevRoomId || merged.check_in !== prevCi || merged.check_out !== prevCo

    if (scheduleOrRoomChanged) {
      const conflict = await hasRoomDateConflict(
        admin,
        caller.organization_id,
        merged.room_id,
        merged.check_in,
        merged.check_out,
        bookingId,
      )
      if (conflict) {
        return NextResponse.json(
          { error: 'Room is already booked for overlapping dates' },
          { status: 409 },
        )
      }
    }

    if (parsed.data.room_id) {
      const { data: room, error: roomErr } = await admin
        .from('rooms')
        .select('id, organization_id, status')
        .eq('id', merged.room_id)
        .single()
      if (roomErr || !room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 400 })
      }
      if ((room as { organization_id: string }).organization_id !== caller.organization_id) {
        return NextResponse.json({ error: 'Room is not in your organization' }, { status: 403 })
      }
      if (String((room as { status?: string }).status || '').toLowerCase() === 'maintenance') {
        return NextResponse.json({ error: 'Cannot assign a room in maintenance' }, { status: 400 })
      }
    }

    const updated_at = new Date().toISOString()
    const updateRow: Record<string, unknown> = {
      ...merged,
      updated_at,
      updated_by: caller_id,
    }

    const { data: updated, error: upErr } = await admin.from('bookings').update(updateRow).eq('id', bookingId).select('*').single()
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    const prevStatus = String((existing as { status?: string }).status ?? '')

    if (parsed.data.room_id !== undefined || scheduleOrRoomChanged || (parsed.data.status !== undefined && parsed.data.status !== prevStatus)) {
      if (merged.room_id !== prevRoomId) {
        await admin.from('rooms').update({ status: 'available', updated_at }).eq('id', prevRoomId)
        const nextHousekeeping = roomHousekeepingAfterEdit(merged.status)
        await admin
          .from('rooms')
          .update({ status: nextHousekeeping, updated_at, updated_by: caller_id })
          .eq('id', merged.room_id)
      } else {
        const nextHousekeeping = roomHousekeepingAfterEdit(merged.status)
        await admin
          .from('rooms')
          .update({ status: nextHousekeeping, updated_at, updated_by: caller_id })
          .eq('id', merged.room_id)
      }
    }

    return NextResponse.json({ booking: updated })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookingId } = await ctx.params
    let caller_id: string | undefined
    try {
      const body = await request.json()
      caller_id = body?.caller_id
    } catch {
      return NextResponse.json({ error: 'JSON body with caller_id is required' }, { status: 400 })
    }

    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const caller = await loadCaller(admin, caller_id)
    if (!caller || !ADMIN_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: booking, error: loadErr } = await admin.from('bookings').select('*').eq('id', bookingId).single()
    if (loadErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if ((booking as { organization_id: string }).organization_id !== caller.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const folioStatus = String((booking as { folio_status?: string }).folio_status || '').toLowerCase()
    if (folioStatus === 'checked_out') {
      return NextResponse.json({ error: 'Cannot delete a checked-out booking' }, { status: 400 })
    }

    const clearBookingChildren = async (table: string) => {
      const { error: deleteError } = await admin.from(table).delete().eq('booking_id', bookingId)
      if (!deleteError) return
      const { error: unlinkError } = await admin.from(table).update({ booking_id: null }).eq('booking_id', bookingId)
      if (unlinkError) throw deleteError
    }

    await clearBookingChildren('payments')
    await clearBookingChildren('transactions')
    await admin.from('folio_charges').delete().eq('booking_id', bookingId)

    let { error } = await admin.from('bookings').delete().eq('id', bookingId)
    if (error && /foreign key constraint/i.test(error.message || '')) {
      await admin.from('payments').update({ booking_id: null }).eq('booking_id', bookingId)
      await admin.from('transactions').update({ booking_id: null }).eq('booking_id', bookingId)
      const retry = await admin.from('bookings').delete().eq('id', bookingId)
      error = retry.error
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const freedRoomId = (booking as { room_id?: string }).room_id
    if (freedRoomId) {
      await admin
        .from('rooms')
        .update({ status: 'available', updated_at: new Date().toISOString() })
        .eq('id', freedRoomId)
    }

    const guestId = (booking as { guest_id?: string }).guest_id
    const orgId = (booking as { organization_id: string }).organization_id
    if (guestId) {
      const { data: guestRow } = await admin.from('guests').select('name').eq('id', guestId).maybeSingle()
      const guestName = guestRow ? (guestRow as { name?: string }).name : undefined
      const [{ data: otherBookings }, { data: guestPayments }, { data: guestTransactions }, ledgerResult] =
        await Promise.all([
          admin.from('bookings').select('id').eq('guest_id', guestId).limit(1),
          admin.from('payments').select('id').eq('guest_id', guestId).limit(1),
          admin.from('transactions').select('id').eq('guest_id', guestId).limit(1),
          guestName
            ? admin
                .from('city_ledger_accounts')
                .select('id, balance')
                .eq('organization_id', orgId)
                .ilike('account_name', guestName)
                .in('account_type', ['individual', 'guest'])
            : Promise.resolve({ data: [] as { id: string; balance: number }[] }),
        ])

      const ledgerAccounts = ledgerResult.data || []
      const hasLedgerBalance = ledgerAccounts.some((account) => Number(account.balance || 0) !== 0)
      if (
        (otherBookings || []).length === 0 &&
        (guestPayments || []).length === 0 &&
        (guestTransactions || []).length === 0 &&
        !hasLedgerBalance
      ) {
        if (ledgerAccounts.length) {
          await admin
            .from('city_ledger_accounts')
            .delete()
            .in(
              'id',
              ledgerAccounts.map((a) => a.id),
            )
        }
        await admin.from('guests').delete().eq('id', guestId)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
