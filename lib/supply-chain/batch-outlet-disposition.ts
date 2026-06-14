import { format, parseISO } from 'date-fns'
import { fetchOutletOrdersInRange } from '@/lib/outlets/fetch-outlet-orders'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { parseMenuStockLink } from '@/lib/outlets/outlet-supply-stock'
import type { OutletMenuItemRow, OutletOrderRow } from '@/lib/outlets/types'

type ItemStockLink = { stockId: string; portionsPerSale: number }

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function countSoldInOrders(
  orders: OutletOrderRow[],
  kitchenStockId: string,
  itemLinkMap: Map<string, ItemStockLink>,
  recipeName?: string,
): number {
  let total = 0
  const normName = recipeName ? normalizeName(recipeName) : ''
  for (const order of orders) {
    if (order.status === 'void') continue
    for (const line of order.outlet_order_lines ?? []) {
      const qty = Number(line.qty) || 0
      if (qty <= 0) continue
      if (line.item_id) {
        const link = itemLinkMap.get(line.item_id)
        if (link?.stockId === kitchenStockId) {
          total += qty * link.portionsPerSale
          continue
        }
      }
      if (normName && normalizeName(line.item_name) === normName) {
        total += qty
      }
    }
  }
  return total
}

/** Count restaurant POS portions sold for a kitchen stock row since batch opened. */
export async function fetchBatchOutletSoldPortions(
  kitchenStockId: string,
  openedAtIso: string,
  recipeName?: string,
): Promise<{ sold: number; error?: string }> {
  if (!kitchenStockId.trim()) return { sold: 0 }

  const opened = parseISO(openedAtIso)
  const fromYmd = format(opened, 'yyyy-MM-dd')
  const toYmd = format(new Date(), 'yyyy-MM-dd')

  try {
    const headers = await outletApiHeaders()
    const menuRes = await fetch('/api/outlets/menu/items?department=restaurant', {
      headers,
      credentials: 'include',
    })
    const menuJson = await menuRes.json().catch(() => ({}))
    if (!menuRes.ok) {
      return {
        sold: 0,
        error: String((menuJson as { error?: string }).error ?? 'Could not load menu items'),
      }
    }

    const itemLinkMap = new Map<string, ItemStockLink>()
    for (const item of ((menuJson as { items?: OutletMenuItemRow[] }).items ?? [])) {
      const parsed = parseMenuStockLink(item.service_code)
      if (parsed?.source === 'kitchen' && item.id) {
        itemLinkMap.set(item.id, {
          stockId: parsed.stockId,
          portionsPerSale: parsed.portionsPerSale,
        })
      }
    }

    const { orders, error } = await fetchOutletOrdersInRange('restaurant', fromYmd, toYmd)
    if (error) return { sold: 0, error }

    const openedMs = opened.getTime()
    const filtered = orders.filter((o) => new Date(o.created_at).getTime() >= openedMs)

    return {
      sold: countSoldInOrders(filtered, kitchenStockId.trim(), itemLinkMap, recipeName),
    }
  } catch {
    return { sold: 0, error: 'Could not reach server for outlet sales' }
  }
}
