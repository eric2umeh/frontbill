import { OUTLET_ITEM_TAGS } from '@/lib/outlets/types'

/** Legacy DB default — hide on POS when unchanged so cards stay clean. */
export const OUTLET_LEGACY_DEFAULT_DESCRIPTION =
  'Carefully selected for your comfort and enjoyment.'

export function isLegacyDefaultDescription(description: string | null | undefined): boolean {
  const d = String(description || '').trim().toLowerCase()
  return (
    d === OUTLET_LEGACY_DEFAULT_DESCRIPTION.toLowerCase() ||
    d === 'carefully selected for your comfort and enjoyment'
  )
}

/** Description shown on POS cards; empty when legacy placeholder or blank. */
export function getItemDisplayDescription(description: string | null | undefined): string | null {
  const d = String(description || '').trim()
  if (!d || isLegacyDefaultDescription(d)) return null
  return d
}

export function formatOutletItemTagLabel(tag: string): string {
  const key = tag.trim().toLowerCase()
  const known = OUTLET_ITEM_TAGS.find((t) => t.key === key)
  if (known) return known.label
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Tags to show on POS (excludes empty / duplicate keys). */
export function getItemDisplayTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const k = String(t).trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

export function normalizeOutletItemTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    const k = String(t)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
    if (out.length >= 8) break
  }
  return out
}
