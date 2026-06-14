import type { OutletMenuCategoryRow } from '@/lib/outlets/types'

type CategoryPriceFlag = Pick<OutletMenuCategoryRow, 'id' | 'parent_id' | 'price_editable'>

export type { CategoryPriceFlag }

/** True when the item's category (or a parent category) allows per-order price edits on POS. */
export function resolveCategoryPriceEditable(
  categoryId: string | null | undefined,
  categories: CategoryPriceFlag[],
): boolean {
  if (!categoryId) return false
  let current = categories.find((c) => c.id === categoryId)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.price_editable) return true
    current = current.parent_id
      ? categories.find((c) => c.id === current!.parent_id)
      : undefined
  }
  return false
}

export function itemAllowsPosPriceEdit(
  item: { category_id: string | null; price_editable?: boolean | null },
  categories: CategoryPriceFlag[],
): boolean {
  if (item.price_editable) return true
  return resolveCategoryPriceEditable(item.category_id, categories)
}
