import type { SupabaseClient } from '@supabase/supabase-js'
import { canSetOutOfOrderFromHousekeeping } from '@/lib/rooms/room-status-auth'
import { pickOccupyingBooking, type OccupyingBookingRow } from '@/lib/rooms/room-occupancy'

export type RoomStatusUpdateSource = 'housekeeping' | 'maintenance'

const HK_ALLOWED = new Set(['available', 'cleaning', 'out_of_order'])
const HK_DISALLOWED = new Set(['occupied', 'reserved', 'maintenance'])
const MAINTENANCE_ALLOWED = new Set(['available', 'maintenance'])
const OCCUPANCY_CLEARING_STATUSES = new Set(['available', 'cleaning'])

const HK_STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  cleaning: 'Cleaning',
  out_of_order: 'Out of Order',
}

const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  maintenance: 'Maintenance',
}

export function validateRoomStatusUpdate(params: {
  source: RoomStatusUpdateSource
  newStatus: string
  role: string
}): { ok: true } | { ok: false; message: string } {
  const status = String(params.newStatus || '').trim().toLowerCase()

  if (params.source === 'housekeeping') {
    if (HK_DISALLOWED.has(status)) {
      return {
        ok: false,
        message: 'That status cannot be set from housekeeping. Use front desk or maintenance.',
      }
    }
    if (!HK_ALLOWED.has(status)) {
      return { ok: false, message: 'Invalid room status for housekeeping.' }
    }
    if (status === 'out_of_order' && !canSetOutOfOrderFromHousekeeping(params.role)) {
      return {
        ok: false,
        message: 'Only Administrator, Superadmin, or Housekeeping can mark a room out of order.',
      }
    }
    return { ok: true }
  }

  if (!MAINTENANCE_ALLOWED.has(status)) {
    return {
      ok: false,
      message:
        'From Maintenance, only Available or Maintenance may be set. Ask Housekeeping for cleaning or out-of-order, or front desk for occupied/reserved.',
    }
  }
  return { ok: true }
}

export async function applyRoomStatusUpdate(
  admin: SupabaseClient,
  params: {
    organizationId: string
    roomId: string
    roomNumber: string
    newStatus: string
    source: RoomStatusUpdateSource
    userId: string
    userName: string
    remark?: string
    scheduledDate?: string
  },
): Promise<{ ok: true; status: string } | { ok: false; message: string }> {
  const newStatus = String(params.newStatus || '').trim().toLowerCase()
  const remark = String(params.remark || '').trim()
  const now = new Date().toISOString()
  const scheduledDate = params.scheduledDate || now.slice(0, 10)

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

  if (OCCUPANCY_CLEARING_STATUSES.has(newStatus)) {
    const { data: bookings, error: bookingFetchError } = await admin
      .from('bookings')
      .select('id, room_id, status, check_in, check_out, folio_status')
      .eq('organization_id', params.organizationId)
      .eq('room_id', params.roomId)
      .in('status', ['checked_in', 'confirmed', 'reserved'])

    if (bookingFetchError) {
      return { ok: false, message: bookingFetchError.message }
    }

    const occupying = pickOccupyingBooking((bookings ?? []) as OccupyingBookingRow[])
    if (occupying) {
      const statusLabel =
        newStatus === 'available' ? 'available' : HK_STATUS_LABELS[newStatus] ?? newStatus
      return {
        ok: false,
        message: `Room ${roomNumber} has an active in-house booking and cannot be marked ${statusLabel}. Check out or move the booking first.`,
      }
    }
  }

  const { error: updateError } = await admin
    .from('rooms')
    .update({ status: newStatus, updated_by: params.userId, updated_at: now })
    .eq('id', params.roomId)
    .eq('organization_id', params.organizationId)

  if (updateError) {
    return { ok: false, message: updateError.message }
  }

  if (params.source === 'housekeeping') {
    const statusLabel = HK_STATUS_LABELS[newStatus] ?? newStatus
    const noteText = remark ? `Status → ${statusLabel}: ${remark}` : `Status → ${statusLabel}`

    const { error: hkError } = await admin.from('housekeeping_tasks').insert({
      organization_id: params.organizationId,
      room_id: params.roomId,
      room_number: roomNumber,
      task_type: 'Room Status Change',
      priority: 'normal',
      notes: noteText,
      created_by: params.userId,
      created_by_name: params.userName,
      scheduled_date: scheduledDate,
      status: 'done',
      completed_at: now,
    })

    if (hkError) {
      return { ok: false, message: hkError.message }
    }
  } else if (remark) {
    const { error: mtError } = await admin.from('maintenance_tasks').insert({
      organization_id: params.organizationId,
      room_id: params.roomId,
      room_number: roomNumber,
      issue_type: 'general',
      description: `Room status changed to ${MAINTENANCE_STATUS_LABELS[newStatus] ?? newStatus}`,
      priority: 'normal',
      notes: remark,
      created_by: params.userId,
      created_by_name: params.userName,
      scheduled_date: scheduledDate,
      status: 'resolved',
      resolved_at: now,
    })

    if (mtError) {
      return { ok: false, message: mtError.message }
    }
  }

  return { ok: true, status: newStatus }
}
