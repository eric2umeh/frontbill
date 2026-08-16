const SUPPLY_LIVE_CHANNEL = 'frontbill-supply-live'

/** Same-tab UI listeners + other browser tabs (store vs kitchen vs F&B). */
export function broadcastSupplyLiveUpdate() {
  if (typeof window === 'undefined') return
  try {
    const ch = new BroadcastChannel(SUPPLY_LIVE_CHANNEL)
    ch.postMessage({ at: Date.now() })
    ch.close()
  } catch {
    /* BroadcastChannel unavailable */
  }
}

export function subscribeSupplyLiveUpdates(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  let ch: BroadcastChannel | null = null
  try {
    ch = new BroadcastChannel(SUPPLY_LIVE_CHANNEL)
    ch.onmessage = () => onUpdate()
  } catch {
    return () => {}
  }
  return () => {
    try {
      ch?.close()
    } catch {
      /* ignore */
    }
  }
}
