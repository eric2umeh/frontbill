'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { kitchenStockIdFromServiceCode } from '@/lib/supply-chain/kitchen-menu-link'

export type RestaurantMenuItemSelection = {
  name: string
  menuItemId?: string | null
  categoryName?: string
  categoryId?: string | null
  sellingPrice?: number | null
  kitchenStockId?: string | null
}

type CatalogItem = {
  id: string
  name: string
  unit_price: number
  category_id: string | null
  service_code: string | null
  is_active: boolean
}

type CatalogCategory = { id: string; name: string }

type Props = {
  label?: string
  placeholder?: string
  value: string
  menuItemId: string | null
  onChange: (selection: RestaurantMenuItemSelection) => void
  required?: boolean
  id?: string
}

export function OutletMenuItemSearchField({
  label = 'Batch / menu name',
  placeholder = 'Search Restaurant menu or type a new dish…',
  value,
  menuItemId,
  onChange,
  required,
  id,
}: Props) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const categoryNameById = useCallback(
    (categoryId: string | null) =>
      categoryId ? categories.find((c) => c.id === categoryId)?.name ?? '' : '',
    [categories],
  )

  const loadCatalog = useCallback(async () => {
    if (loaded) return
    setLoading(true)
    try {
      const res = await fetch('/api/supply/restaurant-menu-catalog', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setItems([])
        setCategories([])
        return
      }
      setItems(json.items ?? [])
      setCategories(json.categories ?? [])
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [loaded])

  useEffect(() => {
    if (!open) return
    void loadCatalog()
  }, [open, loadCatalog])

  const filtered = (() => {
    const q = value.trim().toLowerCase()
    const list = items
    if (!q) return list.slice(0, 25)
    return list.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 25)
  })()

  const selectItem = (item: CatalogItem) => {
    onChange({
      name: item.name,
      menuItemId: item.id,
      categoryName: categoryNameById(item.category_id),
      categoryId: item.category_id,
      sellingPrice: Number(item.unit_price) || 0,
      kitchenStockId: kitchenStockIdFromServiceCode(item.service_code),
    })
    setOpen(false)
  }

  const useTypedName = () => {
    onChange({ name: value.trim(), menuItemId: null, kitchenStockId: null })
    setOpen(false)
  }

  const handleInputChange = (raw: string) => {
    onChange({ name: raw, menuItemId: null, kitchenStockId: null })
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void loadCatalog(), 150)
  }

  const exactMatch = items.some((i) => i.name.trim().toLowerCase() === value.trim().toLowerCase())

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {open && (filtered.length > 0 || value.trim()) && (
          <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectItem(item)}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {categoryNameById(item.category_id) || 'Uncategorized'}
                    {Number(item.unit_price) > 0 ? ` · ${formatNaira(item.unit_price)}` : ''}
                    {kitchenStockIdFromServiceCode(item.service_code) ? ' · Kitchen batch' : ''}
                    {!item.is_active ? ' · Inactive' : ''}
                  </span>
                </button>
              </li>
            ))}
            {value.trim() && !exactMatch && (
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-primary hover:bg-muted font-medium"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={useTypedName}
                >
                  Add &quot;{value.trim()}&quot; to Restaurant &amp; Kitchen
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {menuItemId && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          Linked to Restaurant menu
          <Badge variant="secondary" className="text-[9px] h-4 px-1">
            Existing item
          </Badge>
        </p>
      )}
      {!menuItemId && value.trim() && (
        <p className="text-[10px] text-muted-foreground">
          New name — will be created on Restaurant menu when you save the batch.
        </p>
      )}
    </div>
  )
}
