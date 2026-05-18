import type { StoreCategoryRow } from '@/lib/store/types'

export const BULK_ALL_DEPARTMENTS = '__all__'

/** Match store category names to outlet labels (e.g. "Main Bar — Wine" ↔ "Main Bar"). */
export function categoryMatchesOutlet(categoryName: string, outlet: string): boolean {
  const c = categoryName.toLowerCase().trim()
  const o = outlet.toLowerCase().trim()
  if (!c || !o) return false
  if (c === o) return true
  if (c.startsWith(o)) return true
  if (c.includes(o)) return true
  const head = c.split(/[—–-]/)[0]?.trim()
  if (head && (head === o || head.includes(o) || o.includes(head))) return true
  return false
}

export function categoriesForOutlet(
  categories: StoreCategoryRow[],
  outlet: string,
): StoreCategoryRow[] {
  if (!outlet || outlet === BULK_ALL_DEPARTMENTS) return categories
  return categories.filter((c) => categoryMatchesOutlet(c.name, outlet))
}

export function itemMatchesBulkFilters(
  item: { category_id: string | null; is_active: boolean },
  opts: {
    department: string
    categoryFilter: string
    matchingCategoryIds: Set<string>
    includeInactive: boolean
  },
): boolean {
  if (!opts.includeInactive && !item.is_active) return false
  if (opts.categoryFilter === 'none') {
    if (item.category_id) return false
  } else if (opts.categoryFilter !== 'all') {
    if (item.category_id !== opts.categoryFilter) return false
  }
  if (opts.department !== BULK_ALL_DEPARTMENTS) {
    if (!item.category_id) return false
    if (!opts.matchingCategoryIds.has(item.category_id)) return false
  }
  return true
}
