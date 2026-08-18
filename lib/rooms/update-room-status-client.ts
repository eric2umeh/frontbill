import type { RoomStatusRemark } from '@/lib/rooms/room-status-remarks'

export async function patchHousekeepingStatus(params: {
  room_id: string
  room_number: string
  housekeeping_status: string
  remark?: string
  scheduled_date?: string
}): Promise<{ ok: true; housekeeping_status: string } | { ok: false; message: string }> {
  const res = await fetch('/api/rooms/housekeeping-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, message: String(json.error || 'Could not update housekeeping status') }
  }
  return { ok: true, housekeeping_status: String(json.housekeeping_status || params.housekeeping_status) }
}

export async function patchRoomStatus(params: {
  room_id: string
  room_number: string
  status: string
  source: 'housekeeping' | 'maintenance'
  remark?: string
  scheduled_date?: string
}): Promise<{ ok: true; status: string } | { ok: false; message: string }> {
  const res = await fetch('/api/rooms/update-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, message: String(json.error || 'Could not update room status') }
  }
  return { ok: true, status: String(json.status || params.status) }
}

export async function fetchRoomStatusRemarksClient(roomId: string): Promise<RoomStatusRemark[]> {
  const res = await fetch(`/api/rooms/status-remarks?room_id=${encodeURIComponent(roomId)}`, {
    credentials: 'include',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(json.error || 'Could not load remarks'))
  }
  return (json.remarks ?? []) as RoomStatusRemark[]
}
