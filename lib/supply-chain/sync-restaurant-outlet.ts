import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'
import { normalizeBatchOutletMenuSync, shouldSyncBatchToOutlet } from '@/lib/supply-chain/batch-outlet-sync'

/** Push a kitchen batch standard to outlet POS menu(s) (Supabase). */
export async function syncBatchToRestaurantOutlet(input: {
  batchName: string
  categoryName: string
  kitchenStockId: string
  unitPrice: number
  menuItemId?: string | null
  outletMenuSync: BatchOutletMenuSync | boolean | undefined
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sync = normalizeBatchOutletMenuSync(input.outletMenuSync)
  if (!shouldSyncBatchToOutlet(sync)) {
    return { ok: true }
  }

  try {
    const res = await fetch('/api/supply/sync-restaurant-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        batchName: input.batchName,
        categoryName: input.categoryName,
        unitPrice: input.unitPrice,
        kitchenStockId: input.kitchenStockId,
        menuItemId: input.menuItemId ?? undefined,
        syncTarget: sync,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: String(json.error ?? 'Sync failed') }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('frontbill:outlet-menu-synced'))
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reach server' }
  }
}
