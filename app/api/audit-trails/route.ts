import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type AuditItem = {
  id: string
  source: string
  category: string
  action: string
  status: string
  actor_id: string | null
  actor_name: string
  reference: string
  description: string
  amount?: number | null
  created_at: string
  href?: string
}

const ALLOWED_ROLES = ['superadmin', 'admin', 'manager', 'front_desk']
const TYPE_OPTIONS = ['all', 'backdate', 'booking', 'payment', 'transaction', 'night_audit']

const asNumber = (value: any) => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const isUuid = (value: any) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function inRangeQuery(query: any, column: string, startDate: string, endDate: string) {
  return query.gte(column, `${startDate}T00:00:00.000Z`).lte(column, `${endDate}T23:59:59.999Z`)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const startDate = searchParams.get('start_date') || new Date().toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || startDate
    const type = searchParams.get('type') || 'all'
    const status = searchParams.get('status') || 'all'
    const search = (searchParams.get('search') || '').trim().toLowerCase()
    const limit = Math.min(Number(searchParams.get('limit') || 100), 200)

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    if (!TYPE_OPTIONS.includes(type)) {
      return NextResponse.json({ error: 'Invalid audit type' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (callerError || !callerProfile?.organization_id) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!ALLOWED_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: 'You do not have access to audit trails' }, { status: 403 })
    }

    const orgId = callerProfile.organization_id
    const shouldLoad = (source: string) => type === 'all' || type === source
    const actorIds = new Set<string>()
    const items: AuditItem[] = []

    if (shouldLoad('backdate')) {
      let query = admin
        .from('backdate_requests')
        .select('id, request_type, requested_check_in, requested_check_out, reason, status, requested_by, approved_by, created_at, decided_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)
      query = inRangeQuery(query, 'created_at', startDate, endDate)
      if (status !== 'all') query = query.eq('status', status)
      const { data } = await query
      ;(data || []).forEach((row: any) => {
        if (row.requested_by) actorIds.add(row.requested_by)
        if (row.approved_by) actorIds.add(row.approved_by)
        items.push({
          id: row.id,
          source: 'backdate',
          category: 'Backdate Request',
          action: row.status === 'pending' ? 'Requested backdate' : `${row.status} backdate request`,
          status: row.status,
          actor_id: row.approved_by || row.requested_by || null,
          actor_name: 'Loading...',
          reference: row.request_type?.replace('_', ' ') || 'Backdate',
          description: `${row.reason || 'No reason provided'} (${row.requested_check_in}${row.requested_check_out ? ` to ${row.requested_check_out}` : ''})`,
          created_at: row.decided_at || row.created_at,
        })
      })
    }

    if (shouldLoad('transaction')) {
      let query = admin
        .from('transactions')
        .select('id, transaction_id, booking_id, guest_name, room, amount, payment_method, status, description, received_by, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)
      query = inRangeQuery(query, 'created_at', startDate, endDate)
      if (status !== 'all') query = query.eq('status', status)
      const { data } = await query
      ;(data || []).forEach((row: any) => {
        if (isUuid(row.received_by)) actorIds.add(row.received_by)
        items.push({
          id: row.id,
          source: 'transaction',
          category: 'Transaction',
          action: `Recorded ${row.payment_method || 'payment'} transaction`,
          status: row.status || 'recorded',
          actor_id: isUuid(row.received_by) ? row.received_by : null,
          actor_name: row.received_by || 'System',
          reference: row.transaction_id || row.id.slice(0, 8),
          description: `${row.guest_name || 'Unknown guest'}${row.room ? ` · Room ${row.room}` : ''}${row.description ? ` · ${row.description}` : ''}`,
          amount: asNumber(row.amount),
          created_at: row.created_at,
          href: row.id ? `/transactions/${row.id}` : undefined,
        })
      })
    }

    if (shouldLoad('payment')) {
      let query = admin
        .from('payments')
        .select('id, booking_id, amount, payment_method, payment_date, reference_number, received_by, notes, created_at')
        .eq('organization_id', orgId)
        .order('payment_date', { ascending: false })
        .limit(limit)
      query = inRangeQuery(query, 'payment_date', startDate, endDate)
      const { data } = await query
      ;(data || []).forEach((row: any) => {
        if (row.received_by) actorIds.add(row.received_by)
        items.push({
          id: row.id,
          source: 'payment',
          category: 'Payment',
          action: `Received ${row.payment_method || 'payment'}`,
          status: 'paid',
          actor_id: row.received_by || null,
          actor_name: 'Loading...',
          reference: row.reference_number || row.id.slice(0, 8),
          description: row.notes || `Payment recorded${row.booking_id ? ` for booking ${row.booking_id.slice(0, 8)}` : ''}`,
          amount: asNumber(row.amount),
          created_at: row.payment_date || row.created_at,
        })
      })
    }

    if (shouldLoad('booking')) {
      let query = admin
        .from('bookings')
        .select('id, folio_id, status, payment_status, check_in, check_out, total_amount, balance, created_by, created_at, guests:guest_id(name), rooms:room_id(room_number)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)
      query = inRangeQuery(query, 'created_at', startDate, endDate)
      if (status !== 'all') query = query.eq('status', status)
      const { data } = await query
      ;(data || []).forEach((row: any) => {
        if (row.created_by) actorIds.add(row.created_by)
        const guest = Array.isArray(row.guests) ? row.guests[0] : row.guests
        const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms
        items.push({
          id: row.id,
          source: 'booking',
          category: row.status === 'reserved' ? 'Reservation' : 'Booking',
          action: row.status === 'reserved' ? 'Created reservation' : 'Created booking',
          status: row.status || 'created',
          actor_id: row.created_by || null,
          actor_name: 'Loading...',
          reference: row.folio_id || row.id.slice(0, 8),
          description: `${guest?.name || 'Unknown guest'}${room?.room_number ? ` · Room ${room.room_number}` : ''} · ${row.check_in} to ${row.check_out}`,
          amount: asNumber(row.total_amount),
          created_at: row.created_at,
          href: `/bookings/${row.id}`,
        })
      })
    }

    if (shouldLoad('night_audit')) {
      let query = admin
        .from('night_audits')
        .select('id, audit_date, total_checkouts, total_checkins, occupancy_rate, actual_revenue, variance, issues, notes, created_by, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)
      query = inRangeQuery(query, 'created_at', startDate, endDate)
      const { data } = await query
      ;(data || []).forEach((row: any) => {
        if (row.created_by) actorIds.add(row.created_by)
        items.push({
          id: row.id,
          source: 'night_audit',
          category: 'Night Audit',
          action: 'Ran night audit',
          status: Number(row.variance || 0) === 0 ? 'balanced' : 'variance',
          actor_id: row.created_by || null,
          actor_name: 'Loading...',
          reference: row.audit_date,
          description: `${row.total_checkins || 0} check-ins, ${row.total_checkouts || 0} check-outs${row.notes ? ` · ${row.notes}` : ''}`,
          amount: asNumber(row.actual_revenue),
          created_at: row.created_at,
        })
      })
    }

    const actorMap: Record<string, string> = {}
    if (actorIds.size > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(actorIds))
      ;(profiles || []).forEach((profile: any) => {
        actorMap[profile.id] = profile.full_name || `User ${String(profile.id).slice(0, 8)}`
      })
    }

    const filtered = items
      .map((item) => ({
        ...item,
        actor_name: item.actor_id ? actorMap[item.actor_id] || item.actor_name : item.actor_name,
      }))
      .filter((item) => !search || [
        item.category,
        item.action,
        item.status,
        item.actor_name,
        item.reference,
        item.description,
      ].some((value) => String(value || '').toLowerCase().includes(search)))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)

    return NextResponse.json({ logs: filtered })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
