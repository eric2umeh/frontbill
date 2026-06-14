/** Shared stock-level colours: out (0) = red, low (at/below reorder) = amber, ok = green. */

export type StockLevel = 'out' | 'low' | 'ok'

export function getStockLevel(quantity: number, reorderLevel: number): StockLevel {
  if (quantity <= 0) return 'out'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

export function stockLevelStatusLabel(level: StockLevel): string {
  switch (level) {
    case 'out':
      return 'Out of stock'
    case 'low':
      return 'Low'
    default:
      return 'OK'
  }
}

export function stockLevelTextClass(level: StockLevel): string {
  switch (level) {
    case 'out':
      return 'text-red-700 dark:text-red-400 font-semibold tabular-nums'
    case 'low':
      return 'text-amber-700 dark:text-amber-400 font-semibold tabular-nums'
    default:
      return 'text-emerald-700 dark:text-emerald-400 tabular-nums'
  }
}

export function stockLevelBadgeClass(level: StockLevel): string {
  switch (level) {
    case 'out':
      return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
    case 'low':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
    default:
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
  }
}

export function stockLevelRowClass(level: StockLevel): string {
  switch (level) {
    case 'out':
      return 'bg-red-50/90 dark:bg-red-950/20'
    case 'low':
      return 'bg-amber-50/80 dark:bg-amber-950/15'
    default:
      return ''
  }
}

/** Faint pill behind quantity numbers only (e.g. central store In Store column). */
export function stockLevelNumberPillClass(level: StockLevel): string {
  const base =
    'inline-block rounded px-1.5 py-0.5 tabular-nums font-semibold text-xs'
  switch (level) {
    case 'out':
      return `${base} bg-red-100/80 text-red-800 dark:bg-red-950/35 dark:text-red-300`
    case 'low':
      return `${base} bg-amber-100/80 text-amber-900 dark:bg-amber-950/35 dark:text-amber-200`
    default:
      return `${base} bg-emerald-100/60 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300`
  }
}
