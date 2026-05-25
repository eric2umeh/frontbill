export const EVENT_OTHER_SERVICE_OPTIONS = [
  { value: 'corkage', label: 'Corkage' },
  { value: 'tea_break', label: 'Tea break' },
  { value: 'buffet_lunch', label: 'Buffet lunch' },
  { value: 'dinner', label: 'Dinner' },
] as const

export type EventOtherServiceKey = (typeof EVENT_OTHER_SERVICE_OPTIONS)[number]['value']

/** none = skip; multiple = show all price fields; otherwise one service. */
export type EventOtherServiceChoice = 'none' | 'multiple' | EventOtherServiceKey

export type EventOtherServiceLine = {
  type: EventOtherServiceKey
  amount: number
}

export function eventOtherServiceLabel(type: string): string {
  const found = EVENT_OTHER_SERVICE_OPTIONS.find((o) => o.value === type)
  return found?.label ?? type
}

export function sumEventOtherServices(lines: EventOtherServiceLine[]): number {
  return Math.round(lines.reduce((s, l) => s + Math.max(0, Number(l.amount) || 0), 0) * 100) / 100
}

export function computeEventEstimatedTotal(
  baseEstimated: number,
  otherServices: EventOtherServiceLine[],
): number {
  return Math.round((Math.max(0, baseEstimated) + sumEventOtherServices(otherServices)) * 100) / 100
}

export function parseEventOtherServices(raw: unknown): EventOtherServiceLine[] {
  if (!Array.isArray(raw)) return []
  const allowed = new Set(EVENT_OTHER_SERVICE_OPTIONS.map((o) => o.value))
  const out: EventOtherServiceLine[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const type = String((row as { type?: string }).type || '').trim()
    if (!allowed.has(type as EventOtherServiceKey)) continue
    const amount = Math.max(0, Number((row as { amount?: unknown }).amount) || 0)
    if (amount <= 0) continue
    out.push({ type: type as EventOtherServiceKey, amount })
  }
  return out
}

export function inferOtherServiceChoice(lines: EventOtherServiceLine[]): EventOtherServiceChoice {
  if (lines.length === 0) return 'multiple'
  if (lines.length > 1) return 'multiple'
  return lines[0].type
}

export function formatEventOtherServicesSummary(lines: EventOtherServiceLine[]): string {
  if (lines.length === 0) return ''
  return lines.map((l) => `${eventOtherServiceLabel(l.type)} ${l.amount.toLocaleString()}`).join(', ')
}
