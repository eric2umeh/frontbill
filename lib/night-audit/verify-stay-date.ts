import { isStayCheckInConsideredBackdated } from '@/lib/hotel-date'

export type RefreshNightAuditClosedDates = () => Promise<ReadonlySet<string> | null>

export type StayDateVerification =
  | { ok: true; isBackdated: boolean; closedDates: ReadonlySet<string> }
  | { ok: false }

/**
 * Refresh the Night Audit state immediately before a direct stay write.
 * Unknown or failed audit state must never be interpreted as an open date.
 */
export async function verifyStayDateWithNightAudit(
  checkInYmd: string,
  refreshClosedDates: RefreshNightAuditClosedDates,
  now: Date = new Date(),
  timeZone?: string,
): Promise<StayDateVerification> {
  let closedDates: ReadonlySet<string> | null
  try {
    closedDates = await refreshClosedDates()
  } catch {
    return { ok: false }
  }

  if (!closedDates) return { ok: false }

  return {
    ok: true,
    isBackdated: isStayCheckInConsideredBackdated(checkInYmd, now, timeZone, {
      auditedDates: closedDates,
    }),
    closedDates,
  }
}
