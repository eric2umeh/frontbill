import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'
import { normalizeBatchOutletMenuSync, shouldSyncBatchToOutlet } from '@/lib/supply-chain/batch-outlet-sync'

/** Remove a kitchen batch from Restaurant (and Main Bar when synced) outlet menus. */
export async function deactivateBatchFromRestaurantOutlet(input: {
  kitchenStockId: string
  outletMenuSync?: BatchOutletMenuSync | boolean | undefined
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sync = normalizeBatchOutletMenuSync(input.outletMenuSync)
  if (!shouldSyncBatchToOutlet(sync)) {
    return { ok: true }
  }

  try {
    const res = await fetch('/api/supply/deactivate-restaurant-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        kitchenStockId: input.kitchenStockId,
        syncTarget: sync,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: String(json.error ?? 'Could not remove from outlet menu') }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('frontbill:outlet-menu-synced'))
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reach server' }
  }
}

/** Deactivate kitchen-synced outlet items that no longer have a batch standard. */
export async function reconcileRestaurantKitchenMenu(
  validKitchenStockIds: string[],
): Promise<{ ok: true; deactivated: number } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/supply/reconcile-restaurant-kitchen-menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ validKitchenStockIds }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: String(json.error ?? 'Reconcile failed') }
    }
    const deactivated = Number(json.deactivated) || 0
    if (deactivated > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('frontbill:outlet-menu-synced'))
    }
    return { ok: true, deactivated }
  } catch {
    return { ok: false, error: 'Could not reach server' }
  }
}
