/** Fire-and-forget room status sync after checkout / page load. */
export async function reconcileRoomStatusesClient(): Promise<void> {
  try {
    const res = await fetch('/api/rooms/reconcile-status', {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok && res.status !== 401) {
      console.warn('[rooms] reconcile-status', res.status)
    }
  } catch {
    /* non-blocking */
  }
}
