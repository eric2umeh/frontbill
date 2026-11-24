/**
 * Supply egress controls (Options D / E / G).
 * Default: live cross-user stock sync OFF; stock counts batch; fat hydrate only on Supply/Outlets.
 */

/** Option D — set NEXT_PUBLIC_SUPPLY_LIVE_SYNC=true to re-enable Realtime/poll stock refetch. */
export const SUPPLY_LIVE_SYNC_ENABLED =
  process.env.NEXT_PUBLIC_SUPPLY_LIVE_SYNC === 'true'

/** Option E — coalesce stock-count cloud writes (ms). Flushes earlier on tab hide. */
export const STOCK_COUNT_FLUSH_MS = 45_000

/** Snapshot keys that are cheap enough to load outside Supply/Outlets (badges / alerts). */
export const SUPPLY_LIGHT_HYDRATE_KEYS = [
  'purchase_orders',
  'basket',
  'activity_log',
] as const

/**
 * Option G — full catalogue + kitchen/bar/fnb snapshots only on these routes.
 * Other dashboard pages keep light PO hydrate (or localStorage) to cut egress.
 */
export function pathnameNeedsFullSupplyHydration(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname.startsWith('/supply') || pathname.startsWith('/outlets')
}
