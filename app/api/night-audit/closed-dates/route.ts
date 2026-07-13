import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calendarDateMinusOneDay, formatYMDInTimeZone, resolveHotelTimeZone } from '@/lib/hotel-date'
import { fetchOrganizationHotelTimeZone } from '@/lib/hotel-date-server'

async function resolveAuthedOrg(request: Request) {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()

  let userId = user?.id ?? null
  const admin = createAdminClient()

  if (!userId) {
    const raw = request.headers.get('authorization')?.trim()
    const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
    if (!bearer) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    userId = data.user.id
  }

  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .single()

  if (pe || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) }
  }

  return { admin, organizationId: profile.organization_id as string }
}

/** GET — audit dates already closed (night audit completed). */
export async function GET(request: Request) {
  try {
    const caller = await resolveAuthedOrg(request)
    if ('error' in caller && caller.error) return caller.error

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(7, parseInt(searchParams.get('days') || '30', 10) || 30))

    const { admin, organizationId } = caller
    const tz = await fetchOrganizationHotelTimeZone(organizationId)
    const todayHotel = formatYMDInTimeZone(new Date(), tz)
    let since = todayHotel
    for (let i = 0; i < days - 1; i += 1) {
      since = calendarDateMinusOneDay(since)
    }

    const { data, error } = await admin
      .from('night_audits')
      .select('audit_date')
      .eq('organization_id', organizationId)
      .gte('audit_date', since)
      .order('audit_date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const dates = (data || [])
      .map((r) => String(r.audit_date || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))

    return NextResponse.json({ dates, hotelTimezone: resolveHotelTimeZone(tz) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load closed audit dates'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
