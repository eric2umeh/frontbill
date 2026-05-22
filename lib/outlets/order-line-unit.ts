import type { OutletMenuItemRow } from '@/lib/outlets/types'

/** POS line unit label (legacy thermal bills: BOT, PCK, etc.). */
export function outletItemUnitLabel(item: {
  tags?: string[] | null
  sku?: string | null
  service_code?: string | null
}): string {
  const code = String(item.service_code || item.sku || '').trim().toUpperCase()
  if (code && code.length <= 6) return code
  const tags = (item.tags ?? []).map((t) => String(t).toLowerCase())
  if (tags.some((t) => t.includes('beverage') || t.includes('alcohol') || t === 'bar')) return 'BOT'
  if (tags.some((t) => t.includes('food'))) return 'PCK'
  return 'EA'
}
