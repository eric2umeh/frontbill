export type EventTimeParts = {
  hour12: number
  minute: number
  period: 'AM' | 'PM'
}

/** Display string stored on hotel_events, e.g. "2:00 PM". */
export function formatEventTime(parts: EventTimeParts): string {
  const h = Math.min(12, Math.max(1, parts.hour12))
  const m = Math.min(59, Math.max(0, parts.minute))
  return `${h}:${String(m).padStart(2, '0')} ${parts.period}`
}

/** Parse 12h ("2:00 PM") or legacy 24h ("14:00") into picker parts. */
export function parseEventTimeString(raw: string | null | undefined): EventTimeParts | null {
  const s = String(raw || '').trim()
  if (!s) return null

  const ampmMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/i)
  if (ampmMatch) {
    let hour12 = parseInt(ampmMatch[1], 10)
    const minute = ampmMatch[2] != null ? parseInt(ampmMatch[2], 10) : 0
    const period = /^p/i.test(ampmMatch[3]) ? 'PM' : 'AM'
    if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null
    return { hour12, minute, period: period as 'AM' | 'PM' }
  }

  const h24Match = s.match(/^(\d{1,2}):(\d{2})$/)
  if (h24Match) {
    const h24 = parseInt(h24Match[1], 10)
    const minute = parseInt(h24Match[2], 10)
    if (h24 < 0 || h24 > 23 || minute < 0 || minute > 59) return null
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM'
    let hour12 = h24 % 12
    if (hour12 === 0) hour12 = 12
    return { hour12, minute, period }
  }

  return null
}

export const EVENT_TIME_HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
export const EVENT_TIME_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
