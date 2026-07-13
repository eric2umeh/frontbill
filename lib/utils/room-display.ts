/** Human-readable room label with optional type and amenities. */
export function formatRoomLabel(room: {
  room_number?: string | null
  room_type?: string | null
  amenities?: string[] | null
} | null | undefined): string {
  if (!room?.room_number) return 'Unassigned'
  const base = `Room ${room.room_number}`
  const type = room.room_type?.trim() ? ` — ${room.room_type.trim()}` : ''
  const feats = (room.amenities ?? []).filter(Boolean).slice(0, 4)
  const featStr = feats.length ? ` (${feats.join(', ')})` : ''
  return `${base}${type}${featStr}`
}

export function formatRoomShort(room: {
  room_number?: string | null
  amenities?: string[] | null
} | null | undefined): string {
  if (!room?.room_number) return '—'
  const feats = (room.amenities ?? []).filter(Boolean).slice(0, 2)
  if (!feats.length) return `Room ${room.room_number}`
  return `Room ${room.room_number} (${feats.join(', ')})`
}
