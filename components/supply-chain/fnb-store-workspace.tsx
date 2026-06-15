'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { formatNaira } from '@/lib/utils/currency'
import { canonicalRoleKey } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { RESPONSIVE_HIDE_MD } from '@/lib/ui/responsive-table'

export function FnbStoreWorkspace() {
  const { name, role } = useAuth()
  const { fnbRawStock, barStock, updateFnbRawSellingPrice } = useSupplyChain()
  const [priceMap, setPriceMap] = useState<Record<string, string>>({})
  const [stockTick, setStockTick] = useState(0)
  const actor = { name: name ?? 'F&B', role: canonicalRoleKey(role) ?? 'staff' }

  useEffect(() => {
    const bump = () => setStockTick((t) => t + 1)
    window.addEventListener('frontbill:fnb-raw-stock-changed', bump)
    window.addEventListener('frontbill:bar-stock-changed', bump)
    window.addEventListener('frontbill:supply-stock-changed', bump)
    window.addEventListener('frontbill:issue-out-log-changed', bump)
    return () => {
      window.removeEventListener('frontbill:fnb-raw-stock-changed', bump)
      window.removeEventListener('frontbill:bar-stock-changed', bump)
      window.removeEventListener('frontbill:supply-stock-changed', bump)
      window.removeEventListener('frontbill:issue-out-log-changed', bump)
    }
  }, [])

  const rows = useMemo(() => {
    void stockTick
    const fnb = (fnbRawStock ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      qty: r.quantityOnHand,
      source: 'restaurant' as const,
      sellingPrice: r.sellingPricePerPortion,
      stockId: `fnb-${r.storeItemId}`,
      updateId: r.id,
    }))
    const bar = (barStock ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      qty: r.quantityOnHand,
      source: 'bar' as const,
      sellingPrice: undefined as number | undefined,
      stockId: r.id.startsWith('bar-') ? r.id : `bar-${r.storeItemId}`,
      updateId: null as string | null,
    }))
    return [...fnb, ...bar]
  }, [fnbRawStock, barStock, stockTick])

  const syncBarItemToOutlet = async (
    itemName: string,
    unitPrice: number,
    stockId: string,
    syncTarget: 'restaurant' | 'restaurant_fnb' = 'restaurant_fnb',
  ) => {
    const res = await fetch('/api/supply/sync-restaurant-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        batchName: itemName,
        categoryName: 'Beverages',
        unitPrice,
        kitchenStockId: stockId,
        syncTarget,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.warning(json.error ?? 'Outlet menu sync failed')
      return false
    }
    return true
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="F&B Store"
        description="Bar and restaurant supplies issued from Central Store. Set selling price and sync to outlet menus."
      />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl border p-8 text-center">
          No F&amp;B stock yet. Issue bar items to Main Bar or Restaurant from Central Store — they
          appear here automatically.
        </p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className={RESPONSIVE_HIDE_MD}>Source</TableHead>
                <TableHead className="text-right">Stock qty</TableHead>
                <TableHead className="text-right">Selling price (₦)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const sell =
                  priceMap[row.id] ??
                  (row.sellingPrice != null ? String(row.sellingPrice) : '')
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.name} ({row.unit})
                    </TableCell>
                    <TableCell className={RESPONSIVE_HIDE_MD}>
                      <Badge variant="outline">
                        {row.source === 'bar' ? 'Main Bar' : 'Restaurant'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.qty} {row.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        inputMode="decimal"
                        className="h-8 w-28 ml-auto text-right"
                        placeholder="Price"
                        value={sell}
                        onChange={(e) =>
                          setPriceMap((m) => ({ ...m, [row.id]: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!sell.trim()}
                        onClick={async () => {
                          const price = Number(sell)
                          if (!Number.isFinite(price) || price <= 0) {
                            toast.error('Enter a valid selling price')
                            return
                          }
                          if (row.updateId) {
                            const res = updateFnbRawSellingPrice(row.updateId, price, actor)
                            if ('error' in res) {
                              toast.error(res.error)
                              return
                            }
                          }
                          const ok = await syncBarItemToOutlet(
                            row.name,
                            price,
                            row.stockId,
                            row.source === 'bar' ? 'restaurant_fnb' : 'restaurant',
                          )
                          if (ok) toast.success(`${row.name} synced to outlet menu`)
                        }}
                      >
                        Save &amp; sync outlet
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
