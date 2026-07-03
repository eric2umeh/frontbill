/** True for browser/network failures that often succeed on retry. */
export function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /failed to fetch|network error|networkrequestfailed|econnreset|etimedout|load failed/i.test(
    msg,
  )
}

/** Retry async work when Supabase/browser fetch fails transiently. */
export async function withFetchRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 2
  const baseDelayMs = opts?.baseDelayMs ?? 600
  let last: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (attempt >= retries || !isTransientNetworkError(err)) throw err
      await new Promise((r) => window.setTimeout(r, baseDelayMs * (attempt + 1)))
    }
  }
  throw last
}

export function networkFetchHint(detail: string): string | null {
  if (/failed to fetch/i.test(detail)) {
    return 'Could not reach Supabase — check internet/VPN, wait a moment, or sign in again.'
  }
  return null
}
