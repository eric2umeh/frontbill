import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { formatPersonName } from '@/lib/utils/name-format'
import { guestOrOrganizationNameTaken } from '@/lib/utils/guest-org-name-uniqueness'
import { syncGuestAssociatedNames } from '@/lib/guests/sync-guest-associated-names'
import { isBookingCheckedOut } from '@/lib/utils/booking-checkout-ui'

type RouteCtx = { params: Promise<{ id: string }> }

async function resolveAuthedUserId(request: Request): Promise<string | null> {
  const cookieSb = await createClient()
  const { data: { user } } = await cookieSb.auth.getUser()
  if (user?.id) return user.id
  const raw = request.headers.get('authorization')?.trim()
  const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
  if (!bearer) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}

/** PATCH — update guest profile + sync ledger/transaction names (admin client). */
export async function PATCH(request: Request, ctx: RouteCtx) {
  try {
    const { id: guestId } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const caller_id = body?.caller_id as string | undefined
    const previous_name = typeof body?.previous_name === 'string' ? body.previous_name : ''
    const guestPatch = body?.guest as Record<string, unknown> | undefined

    if (!caller_id || !guestPatch) {
      return NextResponse.json({ error: 'caller_id and guest object are required' }, { status: 400 })
    }

    const authed = await resolveAuthedUserId(request)
    if (!authed || authed !== caller_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: ce } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (ce || !callerProfile?.organization_id) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!hasPermission(callerProfile.role, 'guests:edit')) {
      return NextResponse.json({ error: 'You do not have permission to edit guests' }, { status: 403 })
    }

    const { data: guestRow, error: ge } = await admin
      .from('guests')
      .select('id, name, organization_id')
      .eq('id', guestId)
      .single()

    if (ge || !guestRow || guestRow.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
    }

    const nameRaw = String(guestPatch.name ?? '').trim()
    if (!nameRaw) {
      return NextResponse.json({ error: 'Guest name is required' }, { status: 400 })
    }

    const formattedName = formatPersonName(nameRaw)
    const taken = await guestOrOrganizationNameTaken(admin, {
      hotelTenantOrganizationId: callerProfile.organization_id,
      candidateName: formattedName,
      excludeGuestId: guestId,
    })
    if (taken) {
      return NextResponse.json(
        { error: 'This name is already used by another guest or an organization' },
        { status: 400 },
      )
    }

    const prevForSync = (previous_name || (guestRow as { name?: string }).name || '').trim()

    const { error: upErr } = await admin
      .from('guests')
      .update({
        name: formattedName,
        phone: (guestPatch.phone as string | null) || null,
        email: (guestPatch.email as string | null) || null,
        address: (guestPatch.address as string | null) || null,
        city: (guestPatch.city as string | null) || null,
        country: (guestPatch.country as string | null) || null,
        id_type: (guestPatch.id_type as string | null) || null,
        id_number: (guestPatch.id_number as string | null) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', guestId)

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 })
    }

    let sync: { ledgerUpdated: number; transactionsUpdated: number } | null = null
    if (prevForSync && prevForSync !== formattedName) {
      sync = await syncGuestAssociatedNames(admin, {
        organizationId: callerProfile.organization_id,
        guestId,
        previousName: prevForSync,
        newName: formattedName,
      })
    }

    return NextResponse.json({ ok: true, sync })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE — remove guest and dependent bookings (cascade), ledger rows by name, orphan payments. */
export async function DELETE(request: Request, ctx: RouteCtx) {
  try {
    const { id: guestId } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const caller_id = body?.caller_id as string | undefined

    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const authed = await resolveAuthedUserId(request)
    if (!authed || authed !== caller_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: ce } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (ce || !callerProfile?.organization_id) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!hasPermission(callerProfile.role, 'guests:delete')) {
      return NextResponse.json({ error: 'Only an Administrator or Superadmin may delete guest profiles' }, { status: 403 })
    }

    const { data: guestRow, error: ge } = await admin
      .from('guests')
      .select('id, name, organization_id')
      .eq('id', guestId)
      .single()

    if (ge || !guestRow || guestRow.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
    }

    const orgId = guestRow.organization_id as string
    const guestName = String((guestRow as { name?: string }).name || '')

    const { data: bookings, error: be } = await admin
      .from('bookings')
      .select('id, room_id, status, folio_status')
      .eq('guest_id', guestId)
      .eq('organization_id', orgId)

    if (be) {
      return NextResponse.json({ error: be.message }, { status: 500 })
    }

    for (const b of bookings || []) {
      const row = b as { room_id?: string; status?: string; folio_status?: string | null }
      if (row.room_id && !isBookingCheckedOut({ status: row.status || '', folio_status: row.folio_status })) {
        await admin
          .from('rooms')
          .update({ status: 'available', updated_at: new Date().toISOString() })
          .eq('id', row.room_id)
      }
    }

    const bookingIds = (bookings || []).map((b: { id: string }) => b.id)
    if (bookingIds.length > 0) {
      const { error: delB } = await admin.from('bookings').delete().in('id', bookingIds)
      if (delB) {
        return NextResponse.json({ error: delB.message }, { status: 500 })
      }
    }

    await admin.from('payments').delete().eq('guest_id', guestId).eq('organization_id', orgId)

    const { error: txDelErr } = await admin.from('transactions').delete().eq('guest_id', guestId).eq('organization_id', orgId)
    if (txDelErr && !/column .* does not exist/i.test(txDelErr.message || '')) {
      console.warn('[admin/guests DELETE] transactions guest_id cleanup:', txDelErr.message)
    }

    if (guestName.trim()) {
      const { data: ledgers } = await admin
        .from('city_ledger_accounts')
        .select('id')
        .eq('organization_id', orgId)
        .in('account_type', ['individual', 'guest'])
        .ilike('account_name', guestName.trim())

      const ledgerIds = (ledgers || []).map((r: { id: string }) => r.id)
      if (ledgerIds.length > 0) {
        await admin.from('city_ledger_accounts').delete().in('id', ledgerIds)
      }
    }

    const { error: gErr } = await admin.from('guests').delete().eq('id', guestId)
    if (gErr) {
      return NextResponse.json({ error: gErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deleted_bookings: bookingIds.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
