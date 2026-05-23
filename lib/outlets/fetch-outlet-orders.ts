import { parseISO, startOfDay, endOfDay } from 'date-fns'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletOrderRow } from '@/lib/outlets/types'

/** Fetch outlet orders for a single day or inclusive date range (YYYY-MM-DD). */
export async function fetchOutletOrdersInRange(
  department: OutletDepartmentKey,
  fromYmd: string,
  toYmd: string,
): Promise<{ orders: OutletOrderRow[]; error?: string }> {
  const fromIso = startOfDay(parseISO(fromYmd)).toISOString()
  const toIso = endOfDay(parseISO(toYmd)).toISOString()
  const qs = new URLSearchParams({
    department,
    from: fromIso,
    to: toIso,
  })
  const res = await fetch(`/api/outlets/orders?${qs}`, {
    headers: await outletApiHeaders(),
    credentials: 'include',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { orders: [], error: (json as { error?: string }).error || 'Could not load orders' }
  }
  return { orders: ((json as { orders?: OutletOrderRow[] }).orders ?? []) as OutletOrderRow[] }
}
