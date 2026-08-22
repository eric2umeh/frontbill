import type { SupabaseClient } from '@supabase/supabase-js'
import {
  pmsStatusForHousekeepingStatus,
  type HousekeepingStatusKey,
} from '@/lib/rooms/housekeeping-status'
import {
  pickOccupyingBooking,
  roomStatusFromOccupyingBooking,
  type OccupyingBookingRow,
} from '@/lib/rooms/room-occupancy'

/** HK statuses only housekeepers change — do not overwrite during booking sync. */
const HK_STAFF_LOCKED: ReadonlySet<HousekeepingStatusKey> = new Set([
  'vacant',
  'out_of_order',
])

/** After checkout the room stays on checkout until HK marks vacant or OOO. */
const HK_POST_CHECKOUT: HousekeepingStatusKey = 'checkout'

function normStatus(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

/** Derive system housekeeping status from the active folio on a room. */
export function deriveHousekeepingStatusFromOccupying(
  occupying: Pick<OccupyingBookingRow, 'status' | 'check_in'> | null,
): HousekeepingStatusKey | null {
  if (!occupying) return null
  const pms = roomStatusFromOccupyingBooking(occupying)
  if (pms === 'occupied') return 'occupied'
  if (pms === 'reserved') return 'reservation'
  return null
}

export type RoomHousekeepingPatch = {
  housekeeping_status: HousekeepingStatusKey
  housekeeping_status_updated_at: string
  housekeeping_status_updated_by?: string | null
  housekeeping_status_updated_by_name?: string | null
  status?: string
  updated_at: string
}

/** Room row after guest checkout — needs cleaning before sale. */
export function roomHousekeepingPatchAfterCheckout(now = new Date().toISOString()): RoomHousekeepingPatch {
  return {
    housekeeping_status: HK_POST_CHECKOUT,
    housekeeping_status_updated_at: now,
    housekeeping_status_updated_by: null,
    housekeeping_status_updated_by_name: 'System',
    status: 'cleaning',
    updated_at: now,
  }
}

export function buildHousekeepingSyncPatch(params: {
  currentHousekeepingStatus: string | null | undefined
  occupying: Pick<OccupyingBookingRow, 'status' | 'check_in'> | null
  now?: string
}): Partial<RoomHousekeepingPatch> | null {
  const now = params.now ?? new Date().toISOString()
  const cur = normStatus(params.currentHousekeepingStatus) as HousekeepingStatusKey | ''
  const next = deriveHousekeepingStatusFromOccupying(params.occupying)

  if (params.occupying) {
    if (cur === 'out_of_order') return null
    if (cur === 'vacant' && next) {
      return patchForStatus(next, now)
    }
    if (next && cur !== next) {
      if (HK_STAFF_LOCKED.has(cur as HousekeepingStatusKey)) return null
      if (cur === 'checkout') return null
      return patchForStatus(next, now)
    }
    return null
  }

  // Guest departed — cleaning queue vs ready to sell.
  if (cur === 'occupied') {
    return roomHousekeepingPatchAfterCheckout(now)
  }
  if (cur === 'reservation') {
    return patchForStatus('vacant', now)
  }

  return null
}

/** Room row when guest checks in or a reservation is held on the room. */
export function roomHousekeepingPatchForInHouse(
  bookingStatus: string,
  now = new Date().toISOString(),
): Partial<RoomHousekeepingPatch> {
  const st = String(bookingStatus || '').toLowerCase()
  const hk: HousekeepingStatusKey =
    st === 'reserved' || st === 'confirmed' ? 'reservation' : 'occupied'
  return patchForStatus(hk, now)
}

function patchForStatus(
  hk: HousekeepingStatusKey,
  now: string,
): Partial<RoomHousekeepingPatch> {
  const patch: Partial<RoomHousekeepingPatch> = {
    housekeeping_status: hk,
    housekeeping_status_updated_at: now,
    housekeeping_status_updated_by: null,
    housekeeping_status_updated_by_name: 'System',
    updated_at: now,
  }
  const pms = pmsStatusForHousekeepingStatus(hk)
  if (pms) patch.status = pms
  return patch
}

/** Apply checkout housekeeping status to a room (manual or auto checkout). */
export async function markRoomHousekeepingCheckout(
  admin: SupabaseClient,
  roomId: string,
  organizationId?: string,
): Promise<void> {
  const now = new Date().toISOString()
  const patch = roomHousekeepingPatchAfterCheckout(now)
  let q = admin.from('rooms').update(patch).eq('id', roomId)
  if (organizationId) q = q.eq('organization_id', organizationId)
  const { error } = await q
  if (error) {
    console.warn('[markRoomHousekeepingCheckout]', roomId, error.message)
  }
}

/** Align housekeeping_status with active folios (system-managed statuses only). */
export async function syncHousekeepingStatusesForOrganization(
  admin: SupabaseClient,
  organizationId: string,
  bookings: OccupyingBookingRow[],
): Promise<number> {
  const { data: rooms, error: roomErr } = await admin
    .from('rooms')
    .select('id, housekeeping_status')
    .eq('organization_id', organizationId)

  if (roomErr) throw roomErr

  const byRoom = new Map<string, OccupyingBookingRow[]>()
  for (const b of bookings) {
    if (!b.room_id) continue
    if (!byRoom.has(b.room_id)) byRoom.set(b.room_id, [])
    byRoom.get(b.room_id)!.push(b)
  }

  const now = new Date().toISOString()
  let updated = 0

  for (const room of rooms ?? []) {
    const occupying = pickOccupyingBooking(byRoom.get(room.id) ?? [])
    const patch = buildHousekeepingSyncPatch({
      currentHousekeepingStatus: room.housekeeping_status as string | null,
      occupying,
      now,
    })
    if (!patch?.housekeeping_status) continue
    if (normStatus(room.housekeeping_status) === normStatus(patch.housekeeping_status)) continue

    const { error } = await admin.from('rooms').update(patch).eq('id', room.id)
    if (error) {
      console.warn('[syncHousekeepingStatuses]', room.id, error.message)
      continue
    }
    updated += 1
  }

  return updated
}
