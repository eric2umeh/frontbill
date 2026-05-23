'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'

export type OutletStaffOption = {
  id: string
  name: string
  role?: string | null
}

type Props = {
  organizationId: string
  waiterName: string
  waiterId: string | null
  onWaiterChange: (name: string, id: string | null) => void
}

export function OutletWaiterField({
  organizationId,
  waiterName,
  waiterId,
  onWaiterChange,
}: Props) {
  const [options, setOptions] = useState<OutletStaffOption[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchStaff = useCallback(
    async (term: string) => {
      if (!organizationId || term.trim().length < 1) {
        setOptions([])
        return
      }
      setSearching(true)
      try {
        const res = await fetch(
          `/api/outlets/lookup-staff?q=${encodeURIComponent(term.trim())}`,
          { headers: await outletApiHeaders(), credentials: 'include' },
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setOptions([])
          return
        }
        setOptions(json.staff ?? [])
      } finally {
        setSearching(false)
      }
    },
    [organizationId],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const term = waiterName.trim()
    if (term.length < 1) {
      setOptions([])
      return
    }
    debounceRef.current = setTimeout(() => void searchStaff(term), 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [waiterName, searchStaff])

  const selectStaff = (staff: OutletStaffOption) => {
    onWaiterChange(staff.name, staff.id)
    setOpen(false)
  }

  return (
    <div className="space-y-1">
      <Label>Waiter (optional)</Label>
      <div className="relative">
        <Input
          value={waiterName}
          onChange={(e) => {
            onWaiterChange(e.target.value, null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search staff name…"
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {open && options.length > 0 && (
          <ul className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-lg max-h-48 overflow-y-auto text-sm">
            {options.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-b-0"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectStaff(s)
                  }}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.role && (
                    <span className="text-xs text-muted-foreground ml-2">{s.role.replace(/_/g, ' ')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {waiterId && waiterName.trim() && (
        <p className="text-[10px] text-muted-foreground">Linked to staff profile</p>
      )}
    </div>
  )
}
