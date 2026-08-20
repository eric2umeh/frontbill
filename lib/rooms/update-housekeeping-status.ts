import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getHousekeepingStatusDef,
  isHousekeepingStatusKey,
  pmsStatusPatchForHousekeepingChange,
  type HousekeepingStatusKey,
} from '@/lib/rooms/housekeeping-status'
import {
  OCCUPYING_BOOKING_STATUSES,
  pickOccupyingBooking,
  roomStatusFromOccupyingBooking,
  type OccupyingBookingRow,
} from '@/lib/rooms/room-occupancy'

function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find the table')
}

/** Best-effort log; never fails the room update if the tasks table is missing. */
async function logHousekeepingStatusChange(
  admin: SupabaseClient,
  params: {
    organizationId: string
    roomId: string
    roomNumber: string
    statusLabel: string
    userId: string
    userName: string
    remark?: string
    scheduledDate: string
  },
): Promise<void> {
  const noteText = params.remark
    ? `HK Status → ${params.statusLabel}: ${params.remark}`
    : `HK Status → ${params.statusLabel}`

  const { error } = await admin.from('housekeeping_tasks').insert({
    organization_id: params.organizationId,
    room_id: params.roomId,
    room_number: params.roomNumber,
    task_type: 'Room Status Change',
    priority: 'normal',
    notes: noteText,
    created_by: params.userId,
    created_by_name: params.userName,
    scheduled_date: params.scheduledDate,
    status: 'done',
    completed_at: new Date().toISOString(),
  })

  if (error && !isMissingTableError(error.message)) {
    console.warn('[housekeeping-status] task log failed:', error.message)
  }
}

export async function applyHousekeepingStatusUpdate(
  admin: SupabaseClient,
  params: {
    organizationId: string
    roomId: string
    roomNumber: string
    newStatus: HousekeepingStatusKey
    userId: string
    userName: string
    remark?: string
    scheduledDate?: string
  },
): Promise<
  | {
      ok: true
      status: HousekeepingStatusKey
      updatedAt: string
      updatedByName: string
    }
  | { ok: false; message: string }
> {
  const now = new Date().toISOString()
  const scheduledDate = params.scheduledDate || now.slice(0, 10)
  const def = getHousekeepingStatusDef(params.newStatus)
  if (!def) {
    return { ok: false, message: 'Invalid housekeeping status.' }
  }

  const { data: room, error: roomFetchError } = await admin
    .from('rooms')
    .select('id, room_number, status, organization_id')
    .eq('id', params.roomId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()

  if (roomFetchError) {
    return { ok: false, message: roomFetchError.message }
  }
  if (!room) {
    return { ok: false, message: 'Room not found' }
  }

  const roomNumber = String(room.room_number || params.roomNumber)
  const currentPms = String(room.status || '')
  const leavingOutOfOrder =
    params.newStatus !== 'out_of_order' &&
    currentPms.toLowerCase().replace(/-/g, '_') === 'out_of_order'

  let occupyingPmsStatus: 'occupied' | 'reserved' | null = null
  let occupancyKnown = !leavingOutOfOrder
  if (leavingOutOfOrder) {
    const { data: bookingRows, error: bookingErr } = await admin
      .from('bookings')
      .select('id, room_id, status, check_in, check_out, folio_status')
      .eq('organization_id', params.organizationId)
      .eq('room_id', params.roomId)
      .in('status', [...OCCUPYING_BOOKING_STATUSES])
    if (bookingErr) {
      console.warn('[housekeeping-status] occupancy lookup failed:', bookingErr.message)
    } else {
      occupancyKnown = true
      const occupying = pickOccupyingBooking((bookingRows ?? []) as OccupyingBookingRow[])
      occupyingPmsStatus = occupying ? roomStatusFromOccupyingBooking(occupying) : null
    }
  }

  const patch: Record<string, unknown> = {
    housekeeping_status: params.newStatus,
    housekeeping_status_updated_at: now,
    housekeeping_status_updated_by: params.userId,
    housekeeping_status_updated_by_name: params.userName,
    updated_by: params.userId,
    updated_at: now,
  }

  const syncedPms = occupancyKnown
    ? pmsStatusPatchForHousekeepingChange({
        hkStatus: params.newStatus,
        currentPmsStatus: currentPms,
        occupyingPmsStatus,
      })
    : null
  if (syncedPms) {
    patch.status = syncedPms
  }

  const { error: updateError } = await admin
    .from('rooms')
    .update(patch)
    .eq('id', params.roomId)
    .eq('organization_id', params.organizationId)

  if (updateError) {
    const msg = updateError.message || ''
    if (msg.includes('housekeeping_status') && (msg.includes('column') || msg.includes('schema cache'))) {
      return {
        ok: false,
        message:
          'Housekeeping status column is not set up yet. Ask your administrator to run scripts/078_housekeeping_tables_and_room_status.sql in Supabase.',
      }
    }
    return { ok: false, message: updateError.message }
  }

  await logHousekeepingStatusChange(admin, {
    organizationId: params.organizationId,
    roomId: params.roomId,
    roomNumber,
    statusLabel: `${def.label} (${def.abbr})`,
    userId: params.userId,
    userName: params.userName,
    remark: params.remark,
    scheduledDate,
  })

  return {
    ok: true,
    status: params.newStatus,
    updatedAt: now,
    updatedByName: params.userName,
  }
}

export function parseHousekeepingStatusInput(raw: string): HousekeepingStatusKey | null {
  const norm = String(raw || '').trim().toLowerCase().replace(/-/g, '_')
  return isHousekeepingStatusKey(norm) ? norm : null
}
