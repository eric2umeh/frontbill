/**
 * Short UI beep for new dashboard alerts. Many browsers only play audio after a user gesture.
 */
export function playNotificationBeep(): void {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.setValueAtTime(0.06, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
    o.start(ctx.currentTime)
    o.stop(ctx.currentTime + 0.12)
  } catch {
    // Autoplay / AudioContext policies
  }
}
