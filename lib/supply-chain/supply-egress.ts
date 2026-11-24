/**
 * Supply egress controls (Options C / D / E / G / H).
 *
 * C — Per-item stock patches (`patchSupplySnapshotItem` / catalog qty PATCH).
 *     Never rewrite whole kitchen/bar arrays on a single qty edit.
 * D — Live cross-user stock sync OFF by default (`NEXT_PUBLIC_SUPPLY_LIVE_SYNC=true` to enable).
 *     Soft stock refresh (below) is the no-Realtime substitute on Supply/Outlets only.
 * E — Coalesce stock-count cloud writes; flush on tab hide / before issue-out.
 * G — Fat catalogue + kitchen/bar/fnb hydrate only on `/supply` and `/outlets`.
 * H — Ops: bulk opening counts on local Docker (see docs/LOCAL_DOCKER.md).
 */

/** Option D — set NEXT_PUBLIC_SUPPLY_LIVE_SYNC=true to re-enable Realtime/poll stock refetch. */
export const SUPPLY_LIVE_SYNC_ENABLED =
  process.env.NEXT_PUBLIC_SUPPLY_LIVE_SYNC === 'true'

/**
 * Option E — coalesce stock-count cloud writes (ms).
 * Short enough that counts land in DB; still batches rapid row edits.
 * Always flushes on tab hide / before issue-out / dedicated stock persists.
 */
export const STOCK_COUNT_FLUSH_MS = 2_500

/**
 * Soft re-pull of stock / issue-out when on Supply or Outlets (Option D substitute).
 * Only runs when live sync is OFF. Keep ≥30s to avoid poll storms.
 */
export const SUPPLY_STOCK_REFRESH_TTL_MS = 45_000

/** Snapshot keys that are cheap enough to load outside Supply/Outlets (badges / alerts). */
export const SUPPLY_LIGHT_HYDRATE_KEYS = [
  'purchase_orders',
  'basket',
  'activity_log',
] as const

/**
 * Option G — full catalogue + kitchen/bar/fnb snapshots only on these routes.
 * Other dashboard pages keep light PO hydrate to cut egress.
 */
export function pathnameNeedsFullSupplyHydration(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname.startsWith('/supply') || pathname.startsWith('/outlets')
}

/** Soft-pull central-store catalogue only on the store workspace (not every outlet page). */
export function pathnameNeedsStoreCatalogRefresh(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname.startsWith('/supply/store')
}
