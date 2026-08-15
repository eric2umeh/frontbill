import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import type { OutletMenuCategoryRow } from '@/lib/outlets/types'
import { FNB_DEFAULT_DRINK_CATEGORIES } from '@/lib/supply-chain/fnb-store'

export async function fetchOutletCategories(
  department: string,
): Promise<OutletMenuCategoryRow[]> {
  const res = await fetch(`/api/outlets/menu/categories?department=${encodeURIComponent(department)}`, {
    headers: await outletApiHeaders(),
    credentials: 'include',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(String(json.error ?? 'Failed to load categories'))
  return (json.categories ?? []) as OutletMenuCategoryRow[]
}

/** Create the default drink categories on Main Bar (skips names that already exist). */
export async function seedDefaultDrinkCategories(
  department: 'main_bar' | 'pool_bar' = 'main_bar',
): Promise<{ created: number; categories: OutletMenuCategoryRow[] } | { error: string }> {
  try {
    const existing = await fetchOutletCategories(department)
    const have = new Set(existing.map((c) => c.name.trim().toLowerCase()))
    let created = 0
    for (const name of FNB_DEFAULT_DRINK_CATEGORIES) {
      if (have.has(name.toLowerCase())) continue
      const res = await fetch('/api/outlets/menu/categories', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ department, name }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { error: String(json.error ?? `Could not create ${name}`) }
      }
      created += 1
    }
    const categories = await fetchOutletCategories(department)
    if (typeof window !== 'undefined' && created > 0) {
      window.dispatchEvent(new CustomEvent('frontbill:outlet-menu-synced'))
    }
    return { created, categories }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not seed categories' }
  }
}
