import { normalizeNameKey } from '@/lib/utils/name-format'

/** One row per normalized name; prefer higher balance, then older `created_at`. Merges max balance onto the kept row. */
export function dedupeOrganizationsDisplayByNormalizedName<
  T extends { id: string; name: string; current_balance?: number; created_at?: string },
>(rows: T[]): T[] {
  const buckets = new Map<string, T[]>()
  for (const r of rows) {
    const k = normalizeNameKey(r.name)
    if (!k) continue
    const list = buckets.get(k) ?? []
    list.push(r)
    buckets.set(k, list)
  }
  const result: T[] = []
  for (const [, group] of buckets) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }
    const sorted = [...group].sort((a, b) => {
      const bb = Number(b.current_balance ?? 0)
      const aa = Number(a.current_balance ?? 0)
      if (bb !== aa) return bb - aa
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return ta - tb
    })
    const winner = sorted[0]
    const maxBal = Math.max(...sorted.map((r) => Number(r.current_balance ?? 0)))
    result.push({ ...winner, current_balance: maxBal })
  }
  return result
}
