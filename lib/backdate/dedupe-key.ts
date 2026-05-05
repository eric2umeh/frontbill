export type BackdateDedupeParts = {
  organizationId: string
  requestedBy: string
  requestType: string
  requestedCheckIn: string
  requestedCheckOut: string | null | undefined
  /** Room id for booking/reservation dedupe */
  roomId?: string | null
  /** For bulk: stable fingerprint from wizard state */
  bulkFingerprint?: string | null
}

/**
 * Matches server POST logic so clients can detect matching approved rows.
 */
export function buildBackdateDedupeKey(parts: BackdateDedupeParts): string {
  const co = parts.requestedCheckOut ?? ''
  const room =
    parts.requestType === 'bulk_booking'
      ? parts.bulkFingerprint || 'bulk'
      : parts.roomId || 'no-room'
  return `${parts.organizationId}|${parts.requestedBy}|${parts.requestType}|${parts.requestedCheckIn}|${co}|${room}`
}
