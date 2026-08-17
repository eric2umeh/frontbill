import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'

/** Push an F&B Store drink onto the Main Bar POS menu (`bar:` stock link). */
export async function syncBarItemToMainBarMenu(input: {
  itemName: string
  categoryName: string
  categoryId?: string | null
  barStockId: string
  unitPrice: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/supply/sync-bar-menu', {
      method: 'POST',
      headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({
        itemName: input.itemName,
        categoryName: input.categoryName,
        categoryId: input.categoryId || undefined,
        barStockId: input.barStockId,
        unitPrice: input.unitPrice,
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
