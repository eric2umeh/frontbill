function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message: unknown }).message ?? '')
  }
  return String(err ?? '')
}

/** True for browser/network failures that often succeed on retry. */
export function isTransientNetworkError(err: unknown): boolean {
  const msg = errorMessage(err)
  return /failed to fetch|network error|networkrequestfailed|econnreset|etimedout|load failed|terminated|aborted|aborterror|the operation was aborted/i.test(
    msg,
  )
}

/** Auth cookie/bearer not ready yet — common on first dashboard paint and Fast Refresh. */
export function isRetryableAuthError(err: unknown): boolean {
  const msg = errorMessage(err)
  return /^unauthorized$/i.test(msg.trim()) || /not authenticated|invalid jwt|session/i.test(msg)
}

export function isRetryableSupplyError(err: unknown): boolean {
  return isTransientNetworkError(err) || isRetryableAuthError(err)
}

/** Retry async work when Supabase/browser fetch fails transiently. */
export async function withFetchRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number; retryIf?: (err: unknown) => boolean },
): Promise<T> {
  const retries = opts?.retries ?? 2
  const baseDelayMs = opts?.baseDelayMs ?? 600
  const retryIf = opts?.retryIf ?? isTransientNetworkError
  let last: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (attempt >= retries || !retryIf(err)) throw err
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
