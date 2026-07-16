/**
 * Hotel-facing calendar rules (check-in / backdate) in a fixed IANA timezone.
 * Defaults to Africa/Lagos; override with NEXT_PUBLIC_HOTEL_TIMEZONE or HOTEL_TIMEZONE.
 */

export const DEFAULT_HOTEL_TIMEZONE = 'Africa/Lagos'

/** Client + server: public env wins for browsers; server falls back to HOTEL_TIMEZONE. */
export function defaultHotelTimezone(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_HOTEL_TIMEZONE?.trim())
    return process.env.NEXT_PUBLIC_HOTEL_TIMEZONE.trim()
  if (typeof process !== 'undefined' && process.env.HOTEL_TIMEZONE?.trim()) return process.env.HOTEL_TIMEZONE.trim()
  return DEFAULT_HOTEL_TIMEZONE
}

function isValidIANATimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function resolveHotelTimeZone(preferred?: string | null): string {
  const raw = (preferred || defaultHotelTimezone()).trim()
  return isValidIANATimeZone(raw) ? raw : DEFAULT_HOTEL_TIMEZONE
}

/** YYYY-MM-DD for the calendar day of `instant` in `timeZone`. */
export function formatYMDInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** Local wall-clock hour (0–23) in `timeZone` for `instant`. */
export function getHourInTimeZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const h = parts.find((p) => p.type === 'hour')?.value
  const n = parseInt(h || '0', 10)
  // Some engines still emit 24 for midnight — normalize to 0.
  if (n === 24) return 0
  return Number.isFinite(n) ? n : 0
}

/** Parse YYYY-MM-DD into a local calendar Date at 00:00 (for date pickers). */
export function parseHotelYmdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y || 1970, (m || 1) - 1, d || 1)
  dt.setHours(0, 0, 0, 0)
  return dt
}

/** Previous calendar day as YYYY-MM-DD (pure date math on components). */
export function calendarDateMinusOneDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const ref = new Date(Date.UTC(y, m - 1, d))
  ref.setUTCDate(ref.getUTCDate() - 1)
  const yy = ref.getUTCFullYear()
  const mm = String(ref.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(ref.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * End hour (exclusive) for the "still yesterday" grace window after midnight.
 * e.g. 3 → 00:00–02:59 hotel local can treat yesterday's check-in as non-backdated.
 */
export function backdateGraceEndHourExclusive(): number {
  const raw =
    (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_BACKDATE_GRACE_END_HOUR || process.env.BACKDATE_GRACE_END_HOUR)) ||
    '3'
  const n = parseInt(String(raw), 10)
  if (Number.isNaN(n) || n < 0 || n > 23) return 3
  return n
}

export type StayBackdateOptions = {
  /** YYYY-MM-DD dates where night audit has already been run. */
  auditedDates?: ReadonlySet<string> | readonly string[]
}

function auditedDateSet(opts?: StayBackdateOptions): Set<string> {
  if (!opts?.auditedDates) return new Set()
  return opts.auditedDates instanceof Set
    ? opts.auditedDates
    : new Set(opts.auditedDates)
}

/**
 * Whether a check-in calendar date (YYYY-MM-DD from the date picker, typically staff local)
 * counts as "backdated" for approval / Night Audit rules.
 *
 * **Yesterday** (hotel calendar) is a normal late check-in until night audit closes that
 * date — after that, manager/admin approval is required. Older dates always need approval.
 */
export function isStayCheckInConsideredBackdated(
  checkInYmd: string,
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
  options?: StayBackdateOptions,
): boolean {
  const tz = resolveHotelTimeZone(timeZone)
  const todayHotel = formatYMDInTimeZone(now, tz)
  if (checkInYmd >= todayHotel) return false

  const yesterdayHotel = calendarDateMinusOneDay(todayHotel)
  if (checkInYmd === yesterdayHotel) {
    return auditedDateSet(options).has(checkInYmd)
  }

  return true
}

/**
 * Re-check Night Audit immediately before a stay write.
 * `null` means the closed-date state could not be verified and callers must fail closed.
 */
export async function verifyStayCheckInBackdate(
  checkInYmd: string,
  loadAuditedDates: () => Promise<ReadonlySet<string> | null>,
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
): Promise<boolean | null> {
  const auditedDates = await loadAuditedDates()
  if (auditedDates === null) return null
  return isStayCheckInConsideredBackdated(checkInYmd, now, timeZone, { auditedDates })
}

/** True when staff are in the post-midnight grace window (late arrival / previous-day check-in). */
export function isLateNightCheckInGraceWindow(
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
): boolean {
  const tz = resolveHotelTimeZone(timeZone)
  return getHourInTimeZone(now, tz) < backdateGraceEndHourExclusive()
}

/** Human-readable grace window for UI hints. */
export function lateCheckInGraceWindowLabel(): string {
  const end = backdateGraceEndHourExclusive()
  if (end <= 1) return '12:00 AM'
  if (end === 2) return '1:59 AM'
  const h = end - 1
  const suffix = h === 0 ? '12' : String(h)
  return `${suffix}:59 AM`
}

/**
 * Server-side: whether `requested_check_in` (YYYY-MM-DD) is strictly before "today" on the hotel calendar.
 * Used to validate backdate requests without mixing UTC `Date` midnights.
 */
export function isCalendarDateBeforeHotelToday(requestedYmd: string, now: Date, timeZone: string): boolean {
  const tz = resolveHotelTimeZone(timeZone)
  const todayHotel = formatYMDInTimeZone(now, tz)
  return requestedYmd < todayHotel
}

/**
 * Earliest selectable check-in (YYYY-MM-DD) for date pickers tied to the hotel clock.
 * Always allows **yesterday** so late arrivals can be dated correctly; Night Audit closure
 * of that date is enforced via `isStayCheckInConsideredBackdated` (approval UI).
 */
export function minSelectableCheckInYmdHotel(
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
): string {
  const tz = resolveHotelTimeZone(timeZone)
  return calendarDateMinusOneDay(formatYMDInTimeZone(now, tz))
}

/**
 * Default check-in date for new stays.
 * During the post-midnight late-arrival window (e.g. 12–2:59 AM), prefer **yesterday**
 * when that day has not been night-audited yet — so front desk does not accidentally
 * capture "today" for a guest who arrived just after midnight.
 */
export function defaultStayCheckInYmdHotel(
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
  options?: StayBackdateOptions,
): string {
  const tz = resolveHotelTimeZone(timeZone)
  const todayHotel = formatYMDInTimeZone(now, tz)
  const yesterdayHotel = calendarDateMinusOneDay(todayHotel)
  if (
    getHourInTimeZone(now, tz) < backdateGraceEndHourExclusive() &&
    !auditedDateSet(options).has(yesterdayHotel)
  ) {
    return yesterdayHotel
  }
  return todayHotel
}

/** Add one calendar day to YYYY-MM-DD. */
export function calendarDatePlusOneDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const ref = new Date(Date.UTC(y, m - 1, d))
  ref.setUTCDate(ref.getUTCDate() + 1)
  const yy = ref.getUTCFullYear()
  const mm = String(ref.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(ref.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * From 6pm hotel time onward, night audit defaults to closing *today* (pre-midnight audit).
 * Before that, default is *yesterday* (morning audit for the night that just ended).
 */
export function nightAuditClosesTodayAfterHour(): number {
  const raw =
    (typeof process !== 'undefined' &&
      (process.env.NEXT_PUBLIC_NIGHT_AUDIT_CLOSES_TODAY_AFTER_HOUR ||
        process.env.NIGHT_AUDIT_CLOSES_TODAY_AFTER_HOUR)) ||
    '18'
  const n = parseInt(String(raw), 10)
  if (Number.isNaN(n) || n < 0 || n > 23) return 18
  return n
}

/**
 * Calendar today in the hotel timezone (YYYY-MM-DD).
 * Use for date pickers, order history, and other “today” UI — not night-audit closing day.
 */
export function hotelCalendarTodayYmd(
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
): string {
  return formatYMDInTimeZone(now, resolveHotelTimeZone(timeZone))
}

/**
 * Business day being *closed* when night audit runs (hotel timezone).
 * Example: 7am on 16 May → closes 15 May; 11pm on 15 May → closes 15 May.
 */
export function nightAuditClosingDateYmd(
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
): string {
  const tz = resolveHotelTimeZone(timeZone)
  const todayHotel = formatYMDInTimeZone(now, tz)
  const hour = getHourInTimeZone(now, tz)
  if (hour >= nightAuditClosesTodayAfterHour()) {
    return todayHotel
  }
  return calendarDateMinusOneDay(todayHotel)
}

/** First business day *after* the closed audit date. */
export function nightAuditNextBusinessDateYmd(closingYmd: string): string {
  return calendarDatePlusOneDay(closingYmd)
}

/** en-GB display for audit UI (dd/MM/yyyy). */
export function formatHotelDateDisplayGB(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}
