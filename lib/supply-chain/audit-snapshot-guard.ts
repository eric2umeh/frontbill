/** Audit-trail snapshots that must never be replaced with an empty PUT. */
export const AUDIT_SNAPSHOT_KEYS = ['issue_out_log', 'activity_log'] as const

export type AuditSnapshotKey = (typeof AUDIT_SNAPSHOT_KEYS)[number]

export function isAuditSnapshotKey(key: string): key is AuditSnapshotKey {
  return key === 'issue_out_log' || key === 'activity_log'
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

/**
 * Skip a PUT that would erase a live issue-out or activity log.
 *
 * Supply → Activity → “Clear activity log” zeros client state and the 900ms
 * persist then sends `[]`. The dialog says “on this device”; an empty upsert
 * would wipe the org trail for every workstation.
 *
 * Empty basket is still allowed (clear cart / post-send). Empty audit logs
 * are not a supported org-wide delete.
 */
export function shouldSkipEmptyAuditSnapshotOverwrite(
  key: string,
  incoming: unknown,
  existing: unknown,
): boolean {
  if (!isAuditSnapshotKey(key)) return false
  if (!Array.isArray(incoming) || incoming.length > 0) return false
  return isNonEmptyArray(existing)
}

/** Drop empty audit arrays from a client PUT so a local clear cannot sync. */
export function omitEmptyAuditSnapshots<T extends Record<string, unknown>>(
  payload: T,
): T {
  const out: Record<string, unknown> = { ...payload }
  for (const key of AUDIT_SNAPSHOT_KEYS) {
    if (!(key in out)) continue
    const value = out[key]
    if (Array.isArray(value) && value.length === 0) {
      delete out[key]
    }
  }
  return out as T
}
