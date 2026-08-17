import type { OutletMenuCategoryRow, OutletMenuItemRow } from '@/lib/outlets/types'

function categoryNameNorm(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase()
}

/** Match menu item to a POS category tab — same name counts (handles duplicate category rows). */
export function outletItemMatchesCategory(
  item: OutletMenuItemRow,
  categoryId: string,
  categories: OutletMenuCategoryRow[],
): boolean {
  if (item.category_id === categoryId) return true
  const selected = categories.find((c) => c.id === categoryId)
  if (!selected || !item.category_id) return false
  const itemCat = categories.find((c) => c.id === item.category_id)
  return categoryNameNorm(itemCat?.name) === categoryNameNorm(selected.name)
}

/** Group key for All-tab sections — normalized category name, or empty for uncategorized. */
export function outletItemCategoryGroupKey(
  item: OutletMenuItemRow,
  categories: OutletMenuCategoryRow[],
): string {
  if (!item.category_id) return ''
  const cat = categories.find((c) => c.id === item.category_id)
  return categoryNameNorm(cat?.name)
}
