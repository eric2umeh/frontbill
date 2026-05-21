'use client'

import { useCallback, useMemo, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Minus, Plus, Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'

type LedgerOption = { id: string; name: string; balance: number }

type Props = {
  department: OutletDepartmentKey
  departmentLabel: string
  organizationId: string
  categories: OutletMenuCategoryRow[]
  items: OutletMenuItemRow[]
  onSettled: () => void
  canPrintReceipt?: boolean
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
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [bookingId, setBookingId] = useState('')
  const [roomGuestLabel, setRoomGuestLabel] = useState<string | null>(null)
  const [lookingUpRoom, setLookingUpRoom] = useState(false)
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<LedgerOption[]>([])
  const [selectedLedger, setSelectedLedger] = useState<LedgerOption | null>(null)
  const [roomServiceFee, setRoomServiceFee] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const rootCategories = useMemo(
    () => categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  )

  const subCategories = useMemo(() => {
    if (!parentCategoryId) return []
    return categories
      .filter((c) => c.parent_id === parentCategoryId)
      .sort((a, b) => a.sort_order - b.sort_order)
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
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
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
    return [...map.entries()].map(([key, list]) => ({
      cat: categories.find((c) => c.id === key) ?? null,
      items: list,
    }))
  }, [filteredItems, categories, activeCategoryFilter, parentCategoryId])

  const cartItemsTotal = cart.reduce((s, l) => s + l.item.unit_price * l.qty, 0)
  const parsedRoomServiceFee =
    orderType === 'room_service' && roomServiceFee.trim() !== ''
      ? Math.max(0, Math.round(parseFloat(roomServiceFee) * 100) / 100) || 0
      : 0
  const orderTotal = Math.round((cartItemsTotal + parsedRoomServiceFee) * 100) / 100

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

  const lookupRoom = useCallback(async () => {
    const room = roomNumber.trim()
    if (!room) {
      toast.error('Enter a room number')
      return
    }
    setLookingUpRoom(true)
    setRoomGuestLabel(null)
    setBookingId('')
    try {
      const res = await fetch(`/api/outlets/active-booking?room=${encodeURIComponent(room)}`, {
        headers: await outletApiHeaders(),
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Room lookup failed')
        return
      }
      if (!json.booking) {
        toast.message('No checked-in guest in that room — use guest name or ledger account')
        return
      }
      setBookingId(json.booking.id)
      if (json.booking.guest_name) {
        setGuestName(json.booking.guest_name)
        setRoomGuestLabel(`${json.booking.guest_name} · Room ${json.booking.room_number ?? room}`)
      } else {
        setRoomGuestLabel(`Room ${json.booking.room_number ?? room} (checked in)`)
      }
      toast.success('Guest linked to room')
    } catch {
      toast.error('Network error')
    } finally {
      setLookingUpRoom(false)
    }
  }, [roomNumber])

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

  const settle = async () => {
    if (cart.length === 0) {
      toast.error('Add items to the order first')
      return
    }
    if (paymentMethod === 'city_ledger') {
      const hasRoom = roomNumber.trim().length > 0
      const hasGuest = guestName.trim().length > 0
      const hasLedger = !!selectedLedger?.id
      const hasBooking = !!bookingId.trim()
      if (!hasBooking && !hasGuest && !hasLedger) {
        toast.error('Find room guest, enter guest name, or select a city ledger account')
        return
      }
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/outlets/orders', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          department,
          lines: cart.map((l) => ({ item_id: l.item.id, qty: l.qty })),
          payment_method: paymentMethod,
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
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not complete sale')
        return
      }
      toast.success(
        paymentMethod === 'city_ledger'
          ? `${departmentLabel} charge posted to city ledger — ${json.order?.order_number ?? 'OK'}`
          : `Sale recorded — ${json.order?.order_number ?? 'OK'}`,
      )
      setCart([])
      setGuestName('')
      setRoomNumber('')
      setBookingId('')
      setRoomGuestLabel(null)
      setSelectedLedger(null)
      setLedgerSearch('')
      setLedgerResults([])
      setRoomServiceFee('')
      onSettled()
      if (canPrintReceipt && onOrderSettled && json.order) {
        onOrderSettled(json.order as OutletOrderRow)
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
            <div className="flex justify-between text-lg font-bold pt-1 border-t">
              <span>Total</span>
              <span>{formatNaira(orderTotal)}</span>
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
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Guest name</Label>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Walk-in or ledger name" />
            </div>
            <div className="space-y-1">
              <Label>Room #</Label>
              <div className="flex gap-1">
                <Input
                  value={roomNumber}
                  onChange={(e) => {
                    setRoomNumber(e.target.value)
                    setRoomGuestLabel(null)
                    setBookingId('')
                  }}
                  placeholder="e.g. 101"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void lookupRoom()
                  }}
                />
                <Button type="button" variant="secondary" size="sm" className="shrink-0" disabled={lookingUpRoom} onClick={() => void lookupRoom()}>
                  {lookingUpRoom ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Find'}
                </Button>
              </div>
            </div>
          </div>
          {roomGuestLabel && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
              {roomGuestLabel} — charge will post to folio &amp; city ledger as &quot;{departmentLabel}&quot;
            </p>
          )}
          <div className="space-y-1">
            <Label>Table / reference</Label>
            <Input value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} placeholder="Table 4, etc." />
          </div>
          <div className="space-y-1">
            <Label>Payment</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="city_ledger">Charge to room (city ledger)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paymentMethod === 'city_ledger' && (
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
          <Button className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => void settle()} disabled={submitting || cart.length === 0}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
            Settle &amp; print receipt
          </Button>
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
            <Button type="button" size="sm" variant={categoryId === 'all' ? 'secondary' : 'ghost'} onClick={() => setCategoryId('all')}>
              All in section
            </Button>
            {subCategories.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
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
            <Button type="button" size="sm" variant={categoryId === 'all' ? 'secondary' : 'ghost'} onClick={() => setCategoryId('all')}>
              All
            </Button>
            {rootCategories.map((c) => (
              <Button key={c.id} type="button" size="sm" variant={categoryId === c.id ? 'secondary' : 'ghost'} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </Button>
            ))}
          </div>
        )}

        <ScrollArea className="h-[min(520px,65vh)] pr-2">
          {groupedByCategory.map(({ cat, items: groupItems }) => (
            <section key={cat?.id ?? 'all'} className="mb-6">
              {cat && (
                <div className="flex items-center justify-between mb-3 sticky top-0 bg-background/95 py-1 z-10">
                  <div>
                    <h4 className="text-lg font-semibold font-serif">{cat.name}</h4>
                    <p className="text-xs text-muted-foreground">{groupItems.length} items</p>
                  </div>
                  {cat.tag_label && (
                    <Badge className="bg-amber-100 text-amber-900 border-amber-200">{cat.tag_label}</Badge>
                  )}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                        'text-left rounded-xl border bg-card p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md',
                        inCart && 'ring-2 ring-amber-500/60 border-amber-400',
                      )}
                    >
                      <div className="flex justify-between gap-2">
                        <p className="font-semibold leading-tight">{it.name}</p>
                        <span
                          className={cn(
                            'h-5 w-5 rounded-full border-2 shrink-0',
                            inCart ? 'bg-amber-700 border-amber-700' : 'border-muted-foreground/30',
                          )}
                        />
                      </div>
                      {displayDesc && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{displayDesc}</p>
                      )}
                      {displayTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {displayTags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                              {formatOutletItemTagLabel(t)}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-xl font-bold">{formatNaira(it.unit_price)}</p>
                      {cat && <p className="text-[10px] text-muted-foreground mt-1 text-right">{cat.name}</p>}
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
