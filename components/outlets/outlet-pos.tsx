'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatNaira } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { OutletMenuCategoryRow, OutletMenuItemRow, OutletOrderRow, CartLine } from '@/lib/outlets/types'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import {
  formatOutletItemTagLabel,
  getItemDisplayDescription,
  getItemDisplayTags,
} from '@/lib/outlets/item-display'
import {
  compareOutletMenuByName,
  sortOutletRootCategories,
  sortOutletSubCategories,
} from '@/lib/outlets/sort-outlet-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Minus, Plus, Loader2, Receipt, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { OutletOrderCustomerFields } from '@/components/outlets/outlet-order-customer-fields'
import type { OutletClientOption } from '@/lib/outlets/types'

type LedgerOption = { id: string; name: string; balance: number }

type Props = {
  department: OutletDepartmentKey
  departmentLabel: string
  organizationId: string
  categories: OutletMenuCategoryRow[]
  items: OutletMenuItemRow[]
  onSettled: () => void
  canPrintReceipt?: boolean
  /** Open order saved — print unsettled bill. */
  onOrderBill?: (order: OutletOrderRow) => void
  /** Payment recorded — print settled receipt. */
  onOrderSettled?: (order: OutletOrderRow) => void
}

export function OutletPos({
  department,
  departmentLabel,
  organizationId,
  categories,
  items,
  onSettled,
  canPrintReceipt = false,
  onOrderBill,
  onOrderSettled,
}: Props) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [guestName, setGuestName] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [tableLabel, setTableLabel] = useState('')
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'room_service'>('takeaway')
  const [paymentMethod, setPaymentMethod] = useState('pos')
  const [bookingId, setBookingId] = useState('')
  const [roomGuestLabel, setRoomGuestLabel] = useState<string | null>(null)
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<LedgerOption[]>([])
  const [selectedLedger, setSelectedLedger] = useState<LedgerOption | null>(null)
  const [roomServiceFee, setRoomServiceFee] = useState('')
  const [takeawayFee, setTakeawayFee] = useState('')
  const [isComplimentary, setIsComplimentary] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const rootCategories = useMemo(() => sortOutletRootCategories(categories), [categories])

  const subCategories = useMemo(() => {
    if (!parentCategoryId) return []
    return sortOutletSubCategories(categories, parentCategoryId)
  }, [categories, parentCategoryId])

  const activeCategoryFilter = parentCategoryId
    ? categoryId !== 'all'
      ? categoryId
      : null
    : categoryId !== 'all'
      ? categoryId
      : null

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((it) => it.is_active)
      .filter((it) => {
        if (parentCategoryId && categoryId === 'all') {
          const subIds = subCategories.map((s) => s.id)
          return subIds.includes(it.category_id || '') || it.category_id === parentCategoryId
        }
        if (activeCategoryFilter) return it.category_id === activeCategoryFilter
        return true
      })
      .filter((it) => {
        if (!q) return true
        return it.name.toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q)
      })
      .sort(compareOutletMenuByName)
  }, [items, search, activeCategoryFilter, parentCategoryId, categoryId, subCategories])

  const groupedByCategory = useMemo(() => {
    if (activeCategoryFilter || parentCategoryId) {
      return [{ cat: null as OutletMenuCategoryRow | null, items: filteredItems }]
    }
    const map = new Map<string, OutletMenuItemRow[]>()
    for (const it of filteredItems) {
      const key = it.category_id || '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        cat: categories.find((c) => c.id === key) ?? null,
        items: list,
      }))
      .sort((a, b) =>
        compareOutletMenuByName(
          { name: a.cat?.name ?? 'Uncategorized' },
          { name: b.cat?.name ?? 'Uncategorized' },
        ),
      )
  }, [filteredItems, categories, activeCategoryFilter, parentCategoryId])

  const cartItemsTotal = cart.reduce((s, l) => s + l.item.unit_price * l.qty, 0)
  const parsedRoomServiceFee =
    orderType === 'room_service' && roomServiceFee.trim() !== ''
      ? Math.max(0, Math.round(parseFloat(roomServiceFee) * 100) / 100) || 0
      : 0
  const parsedTakeawayFee =
    orderType === 'takeaway' && takeawayFee.trim() !== ''
      ? Math.max(0, Math.round(parseFloat(takeawayFee) * 100) / 100) || 0
      : 0
  const listTotal = Math.round((cartItemsTotal + parsedRoomServiceFee + parsedTakeawayFee) * 100) / 100
  const orderTotal = isComplimentary ? 0 : listTotal

  useEffect(() => {
    if (!isComplimentary) return
    setSelectedLedger(null)
    setLedgerSearch('')
    setLedgerResults([])
  }, [isComplimentary])

  const addToCart = (item: OutletMenuItemRow) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.item.id === item.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], qty: next[i].qty + 1 }
        return next
      }
      return [...prev, { item, qty: 1 }]
    })
  }

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.item.id === itemId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    )
  }

  const handleClientSelect = useCallback((client: OutletClientOption | null) => {
    if (!client) return
    if (client.kind === 'ledger') {
      setSelectedLedger({
        id: client.id,
        name: client.name,
        balance: client.balance ?? 0,
      })
      setLedgerSearch('')
      setLedgerResults([])
    }
  }, [])

  const searchLedgers = useCallback(async () => {
    const term = ledgerSearch.trim()
    if (!term || !organizationId) return
    const supabase = createClient()
    if (!supabase) return
    const { data } = await supabase
      .from('city_ledger_accounts')
      .select('id, account_name, balance')
      .eq('organization_id', organizationId)
      .ilike('account_name', `%${term}%`)
      .order('account_name')
      .limit(12)
    setLedgerResults(
      (data ?? []).map((d: { id: string; account_name: string; balance: number | null }) => ({
        id: d.id,
        name: d.account_name,
        balance: Number(d.balance) || 0,
      })),
    )
  }, [ledgerSearch, organizationId])

  const buildOrderBody = (settleNow: boolean) => ({
    department,
    lines: cart.map((l) => ({ item_id: l.item.id, qty: l.qty })),
    payment_method: isComplimentary ? 'complimentary' : paymentMethod,
    is_complimentary: isComplimentary,
    order_type: orderType,
    guest_name: guestName.trim() || null,
    room_number: roomNumber.trim() || null,
    table_label: tableLabel.trim() || null,
    booking_id: bookingId.trim() || null,
    city_ledger_account_id: selectedLedger?.id || null,
    room_service_fee:
      orderType === 'room_service' && roomServiceFee.trim() !== ''
        ? parsedRoomServiceFee
        : null,
    takeaway_fee:
      orderType === 'takeaway' && takeawayFee.trim() !== ''
        ? parsedTakeawayFee
        : null,
    settle_now: settleNow,
    bill_only: !settleNow,
  })

  const resetOrderForm = () => {
    setCart([])
    setGuestName('')
    setRoomNumber('')
    setBookingId('')
    setRoomGuestLabel(null)
    setSelectedLedger(null)
    setLedgerSearch('')
    setLedgerResults([])
    setRoomServiceFee('')
    setTakeawayFee('')
    setIsComplimentary(false)
  }

  const submitOrder = async (settleNow: boolean) => {
    if (cart.length === 0) {
      toast.error('Add items to the order first')
      return
    }
    if (!isComplimentary && settleNow && paymentMethod === 'city_ledger') {
      const hasRoom = roomNumber.trim().length > 0
      const hasGuest = guestName.trim().length > 0
      const hasLedger = !!selectedLedger?.id
      const hasBooking = !!bookingId.trim()
      if (!hasBooking && !hasGuest && !hasLedger && !hasRoom) {
        toast.error(
          'For charge to room: pick an in-house room, enter a guest name, or select a city ledger account',
        )
        return
      }
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/outlets/orders', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(buildOrderBody(settleNow)),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not save order')
        return
      }
      const order = json.order as OutletOrderRow
      if (settleNow) {
        toast.success(
          isComplimentary
            ? `Complimentary order settled — ${order?.order_number ?? 'OK'}`
            : paymentMethod === 'city_ledger'
              ? `Charged to room — ${order?.order_number ?? 'OK'}`
              : `Settled — ${order?.order_number ?? 'OK'}`,
        )
        resetOrderForm()
        onSettled()
        if (canPrintReceipt && onOrderSettled && order) {
          onOrderSettled(order)
        }
      } else {
        toast.success(`Bill saved — ${order?.order_number ?? 'OK'}. Print unsettled bill for the guest.`)
        resetOrderForm()
        onSettled()
        if (canPrintReceipt && onOrderBill && order) {
          onOrderBill(order)
        }
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Current order</h3>
          <Badge variant="outline">{departmentLabel}</Badge>
        </div>
        <ScrollArea className="h-[min(280px,40vh)] pr-2">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Tap items to add</p>
          ) : (
            <ul className="space-y-2">
              {cart.map((l) => (
                <li key={l.item.id} className="flex gap-2 text-sm border rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{l.item.name}</p>
                    <p className="text-muted-foreground">{formatNaira(l.item.unit_price)} each</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.item.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center font-mono">{l.qty}</span>
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.item.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="font-semibold tabular-nums shrink-0 w-20 text-right">
                    {formatNaira(l.item.unit_price * l.qty)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t pt-3 space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Items</span>
              <span>{formatNaira(cartItemsTotal)}</span>
            </div>
            {orderType === 'room_service' && parsedRoomServiceFee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Room service fee</span>
                <span>{formatNaira(parsedRoomServiceFee)}</span>
              </div>
            )}
            {orderType === 'takeaway' && parsedTakeawayFee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Take-away fee</span>
                <span>{formatNaira(parsedTakeawayFee)}</span>
              </div>
            )}
            {isComplimentary && listTotal > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground line-through">
                <span>List value</span>
                <span>{formatNaira(listTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-1 border-t">
              <span>{isComplimentary ? 'Total (complimentary)' : 'Total'}</span>
              <span>{isComplimentary ? formatNaira(0) : formatNaira(orderTotal)}</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Order type</Label>
            <Select
              value={orderType}
              onValueChange={(v) => {
                const next = v as typeof orderType
                setOrderType(next)
                if (next !== 'room_service') setRoomServiceFee('')
                if (next !== 'takeaway') setTakeawayFee('')
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="takeaway">Take-away</SelectItem>
                <SelectItem value="dine_in">Dine in</SelectItem>
                <SelectItem value="room_service">Room service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {orderType === 'room_service' && (
            <div className="space-y-1 rounded-lg border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <Label htmlFor="room-service-fee">Room service fee (optional)</Label>
              <Input
                id="room-service-fee"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="e.g. 500"
                value={roomServiceFee}
                onChange={(e) => setRoomServiceFee(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Optional delivery or tray charge when the order is taken to the guest&apos;s room.
              </p>
            </div>
          )}
          {orderType === 'takeaway' && (
            <div className="space-y-1 rounded-lg border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <Label htmlFor="takeaway-fee">Take-away fee (optional)</Label>
              <Input
                id="takeaway-fee"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="e.g. 300"
                value={takeawayFee}
                onChange={(e) => setTakeawayFee(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Optional packaging or handling charge for take-away orders.
              </p>
            </div>
          )}
          <OutletOrderCustomerFields
            organizationId={organizationId}
            guestName={guestName}
            onGuestNameChange={setGuestName}
            onClientSelect={handleClientSelect}
            roomNumber={roomNumber}
            onRoomNumberChange={setRoomNumber}
            onRoomBookingLink={({ bookingId: bid, guestName: gn, label }) => {
              setBookingId(bid ?? '')
              setRoomGuestLabel(label)
              if (gn) setGuestName(gn)
            }}
            selectedLedger={selectedLedger}
            onLedgerSelect={setSelectedLedger}
          />
          {roomGuestLabel && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
              {roomGuestLabel} — charge will post to folio &amp; city ledger as &quot;{departmentLabel}&quot;
            </p>
          )}
          <div className="space-y-1">
            <Label>Table / reference (optional)</Label>
            <Input value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} placeholder="Table 4, etc." />
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-violet-200/80 bg-violet-50/40 dark:bg-violet-950/20 p-3">
            <Checkbox
              id="complimentary-order"
              checked={isComplimentary}
              onCheckedChange={(v) => setIsComplimentary(v === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="complimentary-order" className="text-sm font-medium cursor-pointer">
                Complimentary order
              </Label>
              <p className="text-xs text-muted-foreground leading-snug">
                No charge to the guest or client. Items still print on the bill; total is zero and no payment posts.
              </p>
            </div>
          </div>
          {!isComplimentary && (
          <div className="space-y-1">
            <Label>Payment</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="city_ledger">Charge to room (city ledger)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}
          {!isComplimentary && paymentMethod === 'city_ledger' && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Posts to city ledger with category <strong>{departmentLabel}</strong> (same as folio add charge). Visible on accounts, transactions, and guest balance.
              </p>
              <div className="space-y-1">
                <Label className="text-xs">Or bill to ledger account</Label>
                <div className="flex gap-1">
                  <Input
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search account name…"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void searchLedgers()
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void searchLedgers()}>
                    Search
                  </Button>
                </div>
                {selectedLedger && (
                  <p className="text-xs font-medium text-amber-800">
                    Ledger: {selectedLedger.name} ({formatNaira(selectedLedger.balance)})
                    <Button type="button" variant="link" className="h-auto p-0 ml-2 text-xs" onClick={() => setSelectedLedger(null)}>
                      Clear
                    </Button>
                  </p>
                )}
                {ledgerResults.length > 0 && !selectedLedger && (
                  <ul className="border rounded-md bg-background max-h-28 overflow-y-auto text-xs">
                    {ledgerResults.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 hover:bg-muted"
                          onClick={() => {
                            setSelectedLedger(a)
                            setGuestName(a.name)
                            setLedgerResults([])
                          }}
                        >
                          {a.name} · {formatNaira(a.balance)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void submitOrder(false)}
              disabled={submitting || cart.length === 0}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Save &amp; print unsettled bill
            </Button>
            <Button
              type="button"
              className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={() => void submitOrder(true)}
              disabled={submitting || cart.length === 0}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
              Settle &amp; print receipt
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search menu…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {subCategories.length > 0 || rootCategories.some((c) => categories.some((x) => x.parent_id === c.id)) ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              variant={!parentCategoryId ? 'default' : 'outline'}
              onClick={() => {
                setParentCategoryId(null)
                setCategoryId('all')
              }}
            >
              All
            </Button>
            {rootCategories.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                className="h-7 text-xs"
                variant={parentCategoryId === c.id ? 'default' : 'outline'}
                onClick={() => {
                  setParentCategoryId(c.id)
                  setCategoryId('all')
                }}
              >
                {c.name}
              </Button>
            ))}
          </div>
        ) : null}

        {subCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-6 text-xs" variant={categoryId === 'all' ? 'secondary' : 'ghost'} onClick={() => setCategoryId('all')}>
              All in section
            </Button>
            {subCategories.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                className="h-6 text-xs"
                variant={categoryId === c.id ? 'secondary' : 'ghost'}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}

        {!parentCategoryId && subCategories.length === 0 && rootCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-6 text-xs" variant={categoryId === 'all' ? 'secondary' : 'ghost'} onClick={() => setCategoryId('all')}>
              All
            </Button>
            {rootCategories.map((c) => (
              <Button key={c.id} type="button" size="sm" className="h-6 text-xs" variant={categoryId === c.id ? 'secondary' : 'ghost'} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </Button>
            ))}
          </div>
        )}

        <ScrollArea className="h-[min(560px,72vh)] pr-1">
          {groupedByCategory.map(({ cat, items: groupItems }) => (
            <section key={cat?.id ?? 'all'} className="mb-3">
              {cat && (
                <div className="flex items-center justify-between mb-1.5 sticky top-0 bg-background/95 py-0.5 z-10">
                  <h4 className="text-sm font-semibold">{cat.name}</h4>
                  {cat.tag_label && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">{cat.tag_label}</Badge>
                  )}
                </div>
              )}
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
                {groupItems.map((it) => {
                  const inCart = cart.find((l) => l.item.id === it.id)
                  const displayDesc = getItemDisplayDescription(it.description)
                  const displayTags = getItemDisplayTags(it.tags)
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => addToCart(it)}
                      className={cn(
                        'text-left rounded-lg border bg-card px-2.5 py-2 shadow-sm transition hover:border-amber-400 min-h-[88px] flex flex-col',
                        inCart && 'ring-1 ring-amber-500 border-amber-400 bg-amber-50/50',
                      )}
                    >
                      <div className="flex justify-between gap-1.5 items-start">
                        <p className="text-xs font-semibold leading-snug line-clamp-2 flex-1">{it.name}</p>
                        <span
                          className={cn(
                            'h-3.5 w-3.5 rounded-full border shrink-0 mt-0.5',
                            inCart ? 'bg-amber-700 border-amber-700' : 'border-muted-foreground/40',
                          )}
                        />
                      </div>
                      {displayDesc ? (
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-snug flex-1">
                          {displayDesc}
                        </p>
                      ) : (
                        <span className="flex-1 min-h-[1.25rem]" />
                      )}
                      {displayTags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {displayTags.slice(0, 3).map((t) => (
                            <Badge
                              key={t}
                              variant="secondary"
                              className="text-[9px] font-normal px-1 py-0 h-4 leading-none"
                            >
                              {formatOutletItemTagLabel(t)}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-sm font-bold tabular-nums mt-auto pt-1">{formatNaira(it.unit_price)}</p>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {filteredItems.length === 0 && (
            <p className="text-center text-muted-foreground py-12">No items — add menu items in the Menu tab.</p>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
