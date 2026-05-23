/** Case-insensitive alphabetical sort for outlet menu categories and items. */
export function compareOutletMenuByName(
  a: { name: string },
  b: { name: string },
): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function sortOutletMenuByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort(compareOutletMenuByName)
}

export function sortOutletRootCategories<T extends { name: string; parent_id?: string | null }>(
  categories: T[],
): T[] {
  return sortOutletMenuByName(categories.filter((c) => !c.parent_id))
}

export function sortOutletSubCategories<T extends { name: string; parent_id?: string | null }>(
  categories: T[],
  parentId: string,
): T[] {
  return sortOutletMenuByName(categories.filter((c) => c.parent_id === parentId))
}
