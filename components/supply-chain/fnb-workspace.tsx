'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { SupplyStatRow } from '@/lib/supply-chain/supply-ui'
import { formatNaira } from '@/lib/utils/currency'
import { canonicalRoleKey } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DollarSign, ClipboardList, AlertTriangle, Plus, Minus } from 'lucide-react'
import { toast } from 'sonner'

export function FnbWorkspace() {
  const { name, role } = useAuth()
  const { fnbMenu, kitchenStock, orders, stats, postFnbOrder } = useSupplyChain()
  const [tab, setTab] = useState('orders')
  const [orderOpen, setOrderOpen] = useState(false)
  const [table, setTable] = useState('')
  const [settlement, setSettlement] = useState('pos')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const actor = { name: name ?? 'F&B', role: canonicalRoleKey(role) ?? 'food_beverage' }

  const alerts = useMemo(
    () =>
      fnbMenu.filter((m) => {
        if (m.portionsPerSale <= 0) return false
        const ks = kitchenStock.find((k) => k.id === m.kitchenStockId)
        return !ks || ks.availablePortions < m.portionsPerSale
      }),
    [fnbMenu, kitchenStock],
  )

  const filteredMenu = useMemo(() => {
    if (!search.trim()) return fnbMenu
    return fnbMenu.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
  }, [fnbMenu, search])

  const cartLines = Object.entries(cart).filter(([, q]) => q > 0)
  const subtotal = cartLines.reduce((s, [id, q]) => {
    const m = fnbMenu.find((x) => x.id === id)!
    return s + m.sellingPrice * q
  }, 0)
  const vat = Math.round(subtotal * 0.075)
  const total = subtotal + vat

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm">
          <span className="font-medium text-red-800">86 Warning — {alerts.length} item(s) low or out: </span>
          {alerts.map((a) => (
            <Badge key={a.id} variant="destructive" className="ml-1">{a.name} — 86 OUT</Badge>
          ))}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">F&B / Sales</h1>
        <p className="text-sm text-muted-foreground">Table orders — kitchen stock auto-deducts on every sale</p>
      </div>

      <SupplyStatRow
        cards={[
          { label: "Today's Revenue", value: formatNaira(stats.todayRevenue), icon: DollarSign, tone: 'green' },
          { label: 'Open Orders', value: orders.filter((o) => o.status !== 'paid').length, icon: ClipboardList, tone: 'blue' },
          { label: 'Orders Today', value: orders.length, icon: ClipboardList, tone: 'green' },
          { label: '86 Alerts', value: alerts.length, icon: AlertTriangle, tone: 'red' },
        ]}
      />

      <div className="flex justify-between items-center">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="kitchen-stock">Kitchen Stock</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={() => setOrderOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Order</Button>
      </div>

      {tab === 'orders' && (
        orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">No orders yet — click New Order</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="rounded-lg border p-3 flex justify-between text-sm">
                <span>{o.tableLabel || 'Walk-in'} — {o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</span>
                <span className="font-medium">{formatNaira(o.total)}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'kitchen-stock' && (
        <ul className="space-y-2">
          {kitchenStock.map((k) => (
            <li key={k.id} className="flex justify-between border rounded-lg p-3 text-sm">
              <span>{k.name}</span>
              <Badge className={k.availablePortions <= k.reorderLevel ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}>
                {k.availablePortions} portions
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Order — Kitchen Order Ticket</DialogTitle></DialogHeader>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label>Table / Location</Label>
              <Input value={table} onChange={(e) => setTable(e.target.value)} placeholder="Table 5" />
              <Input placeholder="Search menu…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="space-y-1 max-h-[320px] overflow-y-auto">
                {filteredMenu.map((m) => {
                  const ks = kitchenStock.find((k) => k.id === m.kitchenStockId)
                  const out = m.portionsPerSale > 0 && (!ks || ks.availablePortions < m.portionsPerSale)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={out}
                      onClick={() => setCart((c) => ({ ...c, [m.id]: (c[m.id] ?? 0) + 1 }))}
                      className="w-full flex justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <span>{m.name} <Badge variant="outline" className="ml-1 text-[10px]">{m.category}</Badge></span>
                      <span>{formatNaira(m.sellingPrice)}{out && <span className="block text-red-600 text-xs">86 OUT</span>}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-3 border rounded-xl p-4">
              <h3 className="font-semibold">Basket ({cartLines.length} items)</h3>
              {cartLines.map(([id, qty]) => {
                const m = fnbMenu.find((x) => x.id === id)!
                return (
                  <div key={id} className="flex justify-between items-center text-sm">
                    <span>{m.name}</span>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-7 w-7" allowRepeatClick onClick={() => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) - 1) }))}><Minus className="h-3 w-3" /></Button>
                      <span>{qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" allowRepeatClick onClick={() => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }))}><Plus className="h-3 w-3" /></Button>
                      <span className="w-16 text-right">{formatNaira(m.sellingPrice * qty)}</span>
                    </div>
                  </div>
                )
              })}
              <div className="border-t pt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatNaira(subtotal)}</span></div>
                <div className="flex justify-between"><span>VAT 7.5%</span><span>{formatNaira(vat)}</span></div>
                <div className="flex justify-between font-bold text-emerald-600"><span>Total</span><span>{formatNaira(total)}</span></div>
              </div>
              <Label>Settlement</Label>
              <Select value={settlement} onValueChange={setSettlement}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="room">Charge to room</SelectItem>
                </SelectContent>
              </Select>
              <Button className="w-full" disabled={!cartLines.length} onClick={() => {
                const res = postFnbOrder(cartLines.map(([menuItemId, qty]) => ({ menuItemId, qty })), table, settlement, actor)
                if (res && 'error' in res) toast.error(res.error)
                else { toast.success('Order posted'); setOrderOpen(false); setCart({}) }
              }}>
                Post Order — {formatNaira(total)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
