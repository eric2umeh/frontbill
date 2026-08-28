import type { UsageSignalType } from '@/lib/usage/types'

const DAILY_KEY_PREFIX = 'frontbill_usage_logged_'
const FIRST_OPEN_KEY = 'frontbill_first_open_at'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function dailyStorageKey(signal: UsageSignalType): string {
  return `${DAILY_KEY_PREFIX}${signal}_${todayYmd()}`
}

function alreadyLoggedToday(signal: UsageSignalType): boolean {
  if (typeof window === 'undefined') return true
  try {
    return sessionStorage.getItem(dailyStorageKey(signal)) === '1'
  } catch {
    return false
  }
}

function markLoggedToday(signal: UsageSignalType): void {
  try {
    sessionStorage.setItem(dailyStorageKey(signal), '1')
  } catch {
    /* ignore */
  }
}

export async function recordUsageSignal(
  callerId: string,
  signal: UsageSignalType,
  opts?: { skipDailyDedup?: boolean },
): Promise<void> {
  if (!callerId || typeof window === 'undefined') return
  if (!opts?.skipDailyDedup && alreadyLoggedToday(signal)) return

  try {
    const res = await fetch('/api/usage-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        caller_id: callerId,
        signal_type: signal,
        user_agent: navigator.userAgent?.slice(0, 512) || null,
      }),
    })
    if (res.ok) markLoggedToday(signal)
  } catch {
    /* non-blocking */
  }
}

/** Record first open once; return_open on later days (once per day). */
export async function recordOpenSignals(callerId: string): Promise<void> {
  if (!callerId || typeof window === 'undefined') return
  try {
    const firstAt = localStorage.getItem(FIRST_OPEN_KEY)
    if (!firstAt) {
      localStorage.setItem(FIRST_OPEN_KEY, new Date().toISOString())
      await recordUsageSignal(callerId, 'first_open', { skipDailyDedup: true })
      return
    }
    await recordUsageSignal(callerId, 'return_open')
  } catch {
    /* ignore */
  }
}
