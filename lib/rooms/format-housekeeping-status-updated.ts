import { format } from 'date-fns'

export type HousekeepingStatusAttribution = {
  updatedAt?: string | null
  updatedByName?: string | null
}

/** e.g. "Updated by Jane Doe · 18 Aug 2026, 14:35" */
export function formatHousekeepingStatusUpdated(
  attrs: HousekeepingStatusAttribution,
): string | null {
  const at = attrs.updatedAt ? new Date(attrs.updatedAt) : null
  const by = String(attrs.updatedByName || '').trim()
  if (!at || Number.isNaN(at.getTime())) {
    return by ? `Updated by ${by}` : null
  }
  const when = format(at, 'dd MMM yyyy, HH:mm')
  return by ? `Updated by ${by} · ${when}` : `Updated ${when}`
}

export function housekeepingStatusUpdatedTitle(
  attrs: HousekeepingStatusAttribution,
): string | undefined {
  return formatHousekeepingStatusUpdated(attrs) ?? undefined
}
