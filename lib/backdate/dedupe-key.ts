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
  /** Stable fingerprint for the exact backdated intent being approved */
  intentFingerprint?: string | null
}

function stableFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableFingerprintValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stableFingerprintValue(v)]),
    )
  }
  return value
}

export function buildBackdateIntentFingerprint(value: unknown): string {
  return JSON.stringify(stableFingerprintValue(value))
}

/**
 * Matches server POST logic so clients can detect matching approved rows.
 */
export function buildBackdateDedupeKey(parts: BackdateDedupeParts): string {
  const co = parts.requestedCheckOut ?? ''
  const intent = parts.intentFingerprint || parts.bulkFingerprint || null
  const room =
    parts.requestType === 'bulk_booking' || parts.requestType === 'bulk_reservation'
      ? intent || 'bulk'
      : intent || parts.roomId || 'no-room'
  return `${parts.organizationId}|${parts.requestedBy}|${parts.requestType}|${parts.requestedCheckIn}|${co}|${room}`
}
