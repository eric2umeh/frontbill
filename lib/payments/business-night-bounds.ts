/**
 * Hotel business-night collection windows.
 *
 * Sales collection does NOT cut at calendar midnight. A business night for date D runs from:
 * - start: when the previous night's audit was clicked (or D 00:00 hotel time if none)
 * - end: when D's night audit is clicked (or "now" while D is still the open business night)
 *
 * That way money taken after midnight but before "Run Night Audit" stays on the night being closed.
 */

import {
  calendarDateMinusOneDay,
  calendarDatePlusOneDay,
  hotelCalendarDayUtcBounds,
  hotelCalendarTodayYmd,
  hotelYmdStartUtc,
  nightAuditClosingDateYmd,
  resolveHotelTimeZone,
} from '@/lib/hotel-date'

export type BusinessNightBoundsInput = {
  /** Business night YYYY-MM-DD (the Daily book / audit closing date). */
  ymd: string
  timeZone?: string | null
  now?: Date
  /**
   * organizations.business_date — active posting night until that night is audited.
   * After auditing D, this becomes D+1.
   */
  orgBusinessDate?: string | null
  /** night_audits.created_at for audit_date = ymd - 1 (ISO). */
  previousAuditCompletedAt?: string | null
  /** night_audits.created_at for audit_date = ymd (ISO). */
  thisAuditCompletedAt?: string | null
}

export type BusinessNightUtcBounds = {
  startIso: string
  endExclusiveIso: string
  endInclusiveIso: string
  /** True when the window is empty (day not open yet / invalid). */
  empty: boolean
  /** Human hint for UI. */
  mode:
    | 'open_until_now'
    | 'closed_at_audit'
    | 'calendar_fallback'
    | 'not_open_yet'
}

function toInclusiveEnd(endExclusive: Date): Date {
  return new Date(Math.max(endExclusive.getTime() - 1, 0))
}

/**
 * Resolve UTC bounds for payments/transactions belonging to business night `ymd`.
 */
export function hotelBusinessNightUtcBounds(input: BusinessNightBoundsInput): BusinessNightUtcBounds {
  const tz = resolveHotelTimeZone(input.timeZone)
  const now = input.now ?? new Date()
  const ymd = input.ymd
  const calendar = hotelCalendarDayUtcBounds(ymd, tz)

  const calendarStart = hotelYmdStartUtc(ymd, tz)
  const prevAudit = input.previousAuditCompletedAt
    ? new Date(input.previousAuditCompletedAt)
    : null
  const thisAudit = input.thisAuditCompletedAt ? new Date(input.thisAuditCompletedAt) : null

  const start =
    prevAudit && !Number.isNaN(prevAudit.getTime()) && prevAudit.getTime() > calendarStart.getTime()
      ? prevAudit
      : calendarStart

  const closingCandidate = nightAuditClosingDateYmd(now, tz)
  const hotelToday = hotelCalendarTodayYmd(now, tz)
  const orgBiz =
    typeof input.orgBusinessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.orgBusinessDate)
      ? input.orgBusinessDate
      : null

  /** Open posting night: org business_date, else the night audit would close now. */
  const openNightYmd = orgBiz || closingCandidate
  const isOpenNight = ymd === openNightYmd && !thisAudit

  let endExclusive: Date
  let mode: BusinessNightUtcBounds['mode']

  if (thisAudit && !Number.isNaN(thisAudit.getTime())) {
    endExclusive = thisAudit
    mode = 'closed_at_audit'
  } else if (isOpenNight) {
    endExclusive = now
    mode = 'open_until_now'
  } else if (ymd > openNightYmd || (ymd === hotelToday && ymd > closingCandidate && !orgBiz)) {
    // Next calendar day while previous business night is still open — do not double-count
    // post-midnight cash that still belongs to the open night.
    return {
      startIso: start.toISOString(),
      endExclusiveIso: start.toISOString(),
      endInclusiveIso: start.toISOString(),
      empty: true,
      mode: 'not_open_yet',
    }
  } else {
    // Past night with no audit row recorded — fall back to calendar midnight cutover.
    endExclusive = new Date(calendar.endExclusiveIso)
    mode = 'calendar_fallback'
  }

  if (endExclusive.getTime() <= start.getTime()) {
    return {
      startIso: start.toISOString(),
      endExclusiveIso: start.toISOString(),
      endInclusiveIso: start.toISOString(),
      empty: true,
      mode: mode === 'closed_at_audit' ? 'closed_at_audit' : 'not_open_yet',
    }
  }

  const endInclusive = toInclusiveEnd(endExclusive)
  return {
    startIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
    endInclusiveIso: endInclusive.toISOString(),
    empty: false,
    mode,
  }
}

export type FetchBusinessNightBoundsArgs = {
  supabase: {
    from: (table: string) => any
  }
  organizationId: string
  ymd: string
  timeZone?: string | null
  orgBusinessDate?: string | null
  now?: Date
}

/**
 * Load prior/this audit timestamps (+ optional org business_date) and resolve bounds.
 * Works with browser or admin Supabase clients.
 */
export async function fetchHotelBusinessNightUtcBounds(
  args: FetchBusinessNightBoundsArgs,
): Promise<BusinessNightUtcBounds & { orgBusinessDate: string | null }> {
  const prevYmd = calendarDateMinusOneDay(args.ymd)
  let orgBusinessDate = args.orgBusinessDate ?? null

  const orgPromise =
    orgBusinessDate === null || orgBusinessDate === undefined
      ? args.supabase
          .from('organizations')
          .select('business_date, timezone')
          .eq('id', args.organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null as { business_date?: string; timezone?: string } | null })

  const [orgRes, prevAuditRes, thisAuditRes] = await Promise.all([
    orgPromise,
    args.supabase
      .from('night_audits')
      .select('created_at')
      .eq('organization_id', args.organizationId)
      .eq('audit_date', prevYmd)
      .maybeSingle(),
    args.supabase
      .from('night_audits')
      .select('created_at')
      .eq('organization_id', args.organizationId)
      .eq('audit_date', args.ymd)
      .maybeSingle(),
  ])

  const orgRow = orgRes?.data as { business_date?: string | null; timezone?: string | null } | null
  if (orgBusinessDate == null && orgRow?.business_date) {
    orgBusinessDate = String(orgRow.business_date).slice(0, 10)
  }

  const tz = resolveHotelTimeZone(args.timeZone || orgRow?.timezone)
  const now = args.now ?? new Date()

  // If org.business_date was never set, infer open night: closing candidate, or +1 if already audited.
  if (!orgBusinessDate) {
    const closingCandidate = nightAuditClosingDateYmd(now, tz)
    if (closingCandidate === args.ymd && thisAuditRes?.data?.created_at) {
      orgBusinessDate = calendarDatePlusOneDay(closingCandidate)
    } else if (closingCandidate !== args.ymd) {
      const { data: closingAudit } = await args.supabase
        .from('night_audits')
        .select('created_at')
        .eq('organization_id', args.organizationId)
        .eq('audit_date', closingCandidate)
        .maybeSingle()
      orgBusinessDate = closingAudit?.created_at
        ? calendarDatePlusOneDay(closingCandidate)
        : closingCandidate
    } else {
      orgBusinessDate = closingCandidate
    }
  }

  const bounds = hotelBusinessNightUtcBounds({
    ymd: args.ymd,
    timeZone: tz,
    now,
    orgBusinessDate,
    previousAuditCompletedAt: prevAuditRes?.data?.created_at ?? null,
    thisAuditCompletedAt: thisAuditRes?.data?.created_at ?? null,
  })

  return { ...bounds, orgBusinessDate }
}

/** YYYY-MM-DD to stamp on new payments while a business night is open. */
export function resolvePostingBusinessDateYmd(opts: {
  now?: Date
  timeZone?: string | null
  orgBusinessDate?: string | null
}): string {
  const tz = resolveHotelTimeZone(opts.timeZone)
  const now = opts.now ?? new Date()
  const orgBiz =
    typeof opts.orgBusinessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.orgBusinessDate)
      ? opts.orgBusinessDate
      : null
  return orgBiz || nightAuditClosingDateYmd(now, tz)
}
