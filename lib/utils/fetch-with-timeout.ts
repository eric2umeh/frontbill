/** Client-side fetch that rejects after `ms` so pages cannot spin forever. */
export async function fetchJsonWithTimeout<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ms: number,
): Promise<{ ok: boolean; data: T | null; timedOut: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    const data = (await res.json().catch(() => null)) as T | null
    return { ok: res.ok, data, timedOut: false }
  } catch (err: unknown) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return { ok: false, data: null, timedOut }
  } finally {
    clearTimeout(timer)
  }
}
