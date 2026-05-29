/** Fire-and-forget room status sync after checkout / page load. */
export async function reconcileRoomStatusesClient(): Promise<void> {
  try {
    await fetch('/api/rooms/reconcile-status', { method: 'POST', credentials: 'include' })
  } catch {
    /* non-blocking */
  }
}
