'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Minus, Plus } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import type { OutletMenuItemRow } from '@/lib/outlets/types'
import {
  menuDefaultUnitPrice,
  parseOutletUnitPriceInput,
  roundOutletMoney,
} from '@/lib/outlets/cart-line-price'

type Props = {
  item: OutletMenuItemRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (item: OutletMenuItemRow, qty: number, unitPrice: number) => void
}

export function OutletAddToCartDialog({ item, open, onOpenChange, onConfirm }: Props) {
  const menuPrice = item ? menuDefaultUnitPrice(item.unit_price) : 0
  const [priceInput, setPriceInput] = useState('')
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (!open || !item) return
    setPriceInput(String(menuDefaultUnitPrice(item.unit_price)))
    setQty(1)
  }, [open, item])

  if (!item) return null

  const parsedPrice = parseOutletUnitPriceInput(priceInput)
  const lineTotal =
    parsedPrice != null ? roundOutletMoney(parsedPrice * qty) : null
  const priceChanged = parsedPrice != null && parsedPrice !== menuPrice

  const handleConfirm = () => {
    if (parsedPrice == null) return
    if (qty < 1) return
    onConfirm(item, qty, parsedPrice)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug pr-6">{item.name}</DialogTitle>
          <DialogDescription>
            Menu default is {formatNaira(menuPrice)}. Change the unit price for this order only — the
            menu item price in Menu settings stays the same.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="space-y-1">
            <Label htmlFor="outlet-line-unit-price">Unit price (this order)</Label>
            <Input
              id="outlet-line-unit-price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm()
              }}
              autoFocus
            />
            {priceChanged && parsedPrice != null && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Custom price for this bill only (menu stays {formatNaira(menuPrice)}).
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Quantity</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Input
                type="number"
                min={1}
                step={1}
                className="h-8 w-16 text-center"
                value={qty}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  setQty(Number.isFinite(n) && n >= 1 ? n : 1)
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setQty((q) => q + 1)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {lineTotal != null && (
            <p className="text-sm font-semibold text-right tabular-nums">
              Line total: {formatNaira(lineTotal)}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={parsedPrice == null || qty < 1}>
            Add to order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
