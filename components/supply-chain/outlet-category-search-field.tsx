'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'

type CategoryOption = { id: string; name: string }

type Props = {
  department?: OutletDepartmentKey
  label?: string
  placeholder?: string
  value: string
  categoryId: string | null
  onChange: (name: string, id: string | null) => void
  required?: boolean
  id?: string
}

export function OutletCategorySearchField({
  department = 'restaurant',
  label = 'Menu category',
  placeholder = 'Search or type a new category…',
  value,
  categoryId,
  onChange,
  required,
  id,
}: Props) {
  const [options, setOptions] = useState<CategoryOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCategories = useCallback(
    async (term: string) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ department })
        const res = await fetch(`/api/outlets/menu/categories?${params}`, {
          credentials: 'include',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setOptions([])
          return
        }
        const all: CategoryOption[] = (json.categories ?? []).map(
          (c: { id: string; name: string }) => ({ id: c.id, name: c.name }),
        )
        const q = term.trim().toLowerCase()
        setOptions(q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all)
      } finally {
        setLoading(false)
      }
    },
    [department],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!open) return
    debounceRef.current = setTimeout(() => void loadCategories(value), value.trim() ? 200 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, open, loadCategories])

  const selectCategory = (cat: CategoryOption) => {
    onChange(cat.name, cat.id)
    setOpen(false)
  }

  const useTypedName = () => {
    onChange(value.trim(), null)
    setOpen(false)
  }

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
          onChange={(e) => {
            onChange(e.target.value, null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {open && (options.length > 0 || value.trim()) && (
          <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md">
            {options.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectCategory(cat)}
                >
                  {cat.name}
                </button>
              </li>
            ))}
            {value.trim() &&
              !options.some((c) => c.name.toLowerCase() === value.trim().toLowerCase()) && (
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-primary hover:bg-muted font-medium"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={useTypedName}
                  >
                    Create category &quot;{value.trim()}&quot;
                  </button>
                </li>
              )}
          </ul>
        )}
      </div>
      {categoryId && (
        <p className="text-[10px] text-muted-foreground">Linked to existing restaurant category</p>
      )}
    </div>
  )
}
