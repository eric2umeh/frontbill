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
    hour12: false,
  }).formatToParts(instant)
  const h = parts.find((p) => p.type === 'hour')?.value
  return parseInt(h || '0', 10)
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
 * e.g. 2 → 00:00–01:59 hotel local can treat yesterday's check-in as non-backdated.
 */
export function backdateGraceEndHourExclusive(): number {
  const raw =
    (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_BACKDATE_GRACE_END_HOUR || process.env.BACKDATE_GRACE_END_HOUR)) ||
    '2'
  const n = parseInt(String(raw), 10)
  if (Number.isNaN(n) || n < 0 || n > 23) return 2
  return n
}

/**
 * Whether a check-in calendar date (YYYY-MM-DD from the date picker, typically staff local)
 * counts as "backdated" for approval / Night Audit rules.
 *
 * When within the grace window on the hotel clock, **yesterday** (relative to hotel date) is
 * treated as a normal same-night booking, not a backdate.
 */
export function isStayCheckInConsideredBackdated(
  checkInYmd: string,
  now: Date = new Date(),
  timeZone: string = resolveHotelTimeZone(),
): boolean {
  const tz = resolveHotelTimeZone(timeZone)
  const todayHotel = formatYMDInTimeZone(now, tz)
  if (checkInYmd >= todayHotel) return false

  const graceEnd = backdateGraceEndHourExclusive()
  const hour = getHourInTimeZone(now, tz)
  const yesterdayHotel = calendarDateMinusOneDay(todayHotel)
  if (hour < graceEnd && checkInYmd === yesterdayHotel) return false

  return true
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
 * During the post-midnight grace window, yesterday remains enabled.
 */
export function minSelectableCheckInYmdHotel(now: Date = new Date(), timeZone: string = resolveHotelTimeZone()): string {
  const tz = resolveHotelTimeZone(timeZone)
  const todayHotel = formatYMDInTimeZone(now, tz)
  const hour = getHourInTimeZone(now, tz)
  if (hour < backdateGraceEndHourExclusive()) {
    return calendarDateMinusOneDay(todayHotel)
  }
  return todayHotel
}
