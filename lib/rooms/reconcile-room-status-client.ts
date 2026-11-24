/** Coalesce reconcile POSTs so navigation / strip / modals do not re-hit the API every time. */
const RECONCILE_TTL_MS = 3 * 60 * 1000

let lastReconcileAt = 0
let inFlight: Promise<void> | null = null

/**
 * Fire-and-forget room status sync after checkout / page load.
 * Default TTL skips repeat calls within 3 minutes (egress). Pass `{ force: true }` after
 * checkout / check-in mutations that must sync immediately.
 */
export async function reconcileRoomStatusesClient(opts?: {
  force?: boolean
}): Promise<void> {
  if (!opts?.force && Date.now() - lastReconcileAt < RECONCILE_TTL_MS) {
    return
  }
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const url = opts?.force
        ? '/api/rooms/reconcile-status?force=1'
        : '/api/rooms/reconcile-status'
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: opts?.force
          ? { 'x-frontbill-reconcile-force': '1' }
          : undefined,
      })
      if (!res.ok && res.status !== 401) {
        console.warn('[rooms] reconcile-status', res.status)
      } else if (res.ok) {
        lastReconcileAt = Date.now()
      }
    } catch {
      /* non-blocking */
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}
