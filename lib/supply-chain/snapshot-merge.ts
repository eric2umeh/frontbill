/** Merge JSON snapshot rows by `id`, preferring rows from `preferred`. */
export function mergeSnapshotRowsById<T extends { id: string }>(
  base: T[],
  preferred: T[],
): T[] {
  const map = new Map<string, T>()
  for (const row of base) map.set(row.id, row)
  for (const row of preferred) map.set(row.id, row)
  return Array.from(map.values())
}

/** Pick the best snapshot array when hydrating local + remote supply-chain state. */
export function resolveSupplySnapshot<T extends { id: string }>(
  local: T[],
  remote: unknown,
): T[] {
  const remoteArr = Array.isArray(remote) ? (remote as T[]) : []
  if (local.length === 0) return remoteArr
  if (remoteArr.length === 0) return local
  return mergeSnapshotRowsById(remoteArr, local)
}

/**
 * Pick the snapshot array that should become local React state for append-only
 * workflow snapshots that are migrated from localStorage into cloud storage.
 */
export function resolveLongerSupplySnapshot<T>(
  local: T[],
  remote: unknown,
): T[] {
  const remoteArr = Array.isArray(remote) ? (remote as T[]) : []
  return local.length > remoteArr.length ? local : remoteArr
}
