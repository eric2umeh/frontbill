'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isOrganizationMenuRecord } from '@/lib/utils/ledger-organization'

export type EventClientPick = {
  kind: 'guest' | 'organization'
  id: string
  name: string
  phone: string
  email: string
}

export type EventClientValue = {
  client_name: string
  client_phone: string
  client_email: string
  guest_id?: string | null
}

type Props = {
  organizationId: string
  value: EventClientValue
  onChange: (next: EventClientValue) => void
  disabled?: boolean
}

export function EventClientSearchField({
  organizationId,
  value,
  onChange,
  disabled,
}: Props) {
  const [guests, setGuests] = useState<EventClientPick[]>([])
  const [suggestions, setSuggestions] = useState<EventClientPick[]>([])
  const [open, setOpen] = useState(false)
  const [linked, setLinked] = useState<EventClientPick | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    const supabase = createClient()
    if (!supabase) return
    void (async () => {
      const { data } = await supabase
        .from('guests')
        .select('id, name, phone, email')
        .eq('organization_id', organizationId)
        .order('name')
        .limit(500)
      setGuests(
        (data ?? []).map((g) => ({
          kind: 'guest' as const,
          id: g.id,
          name: g.name,
          phone: g.phone || '',
          email: g.email || '',
        })),
      )
    })()
  }, [organizationId])

  const searchOrganizations = useCallback(
    async (term: string): Promise<EventClientPick[]> => {
      const supabase = createClient()
      if (!supabase || !organizationId || !term.trim()) return []
      const { data } = await supabase
        .from('organizations')
        .select('id, name, phone, email, org_type, created_by')
        .eq('organization_id', organizationId)
        .ilike('name', `%${term.trim()}%`)
        .order('name')
        .limit(12)
      return (data ?? [])
        .filter((o) => isOrganizationMenuRecord(o, organizationId))
        .map((o) => ({
          kind: 'organization' as const,
          id: o.id,
          name: o.name,
          phone: o.phone || '',
          email: o.email || '',
        }))
    },
    [organizationId],
  )

  const runSearch = useCallback(
    async (term: string) => {
      const q = term.trim().toLowerCase()
      if (!q) {
        setSuggestions([])
        setOpen(false)
        return
      }
      setSearching(true)
      try {
        const guestHits = guests.filter(
          (g) => g.name.toLowerCase().includes(q) || g.phone.includes(term.trim()),
        )
        const orgHits = await searchOrganizations(term)
        const seen = new Set<string>()
        const merged: EventClientPick[] = []
        for (const row of [...guestHits, ...orgHits]) {
          const key = `${row.kind}:${row.id}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(row)
        }
        setSuggestions(merged.slice(0, 12))
        setOpen(merged.length > 0)
      } finally {
        setSearching(false)
      }
    },
    [guests, searchOrganizations],
  )

  const handleNameChange = (name: string) => {
    setLinked(null)
    onChange({ ...value, client_name: name, guest_id: null })
    void runSearch(name)
  }

  const selectPick = (pick: EventClientPick) => {
    setLinked(pick)
    onChange({
      client_name: pick.name,
      client_phone: pick.phone,
      client_email: pick.email,
      guest_id: pick.kind === 'guest' ? pick.id : null,
    })
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Client (guest or organization)</Label>
        <div className="relative">
          <Input
            placeholder="Type name — existing guests or organizations will appear"
            value={value.client_name}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            disabled={disabled}
          />
          {open && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-background shadow-lg">
              {suggestions.map((row) => (
                <button
                  key={`${row.kind}-${row.id}`}
                  type="button"
                  className="w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectPick(row)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{row.name}</span>
                    <span className="text-[10px] uppercase text-muted-foreground shrink-0">
                      {row.kind === 'guest' ? 'Guest' : 'Organization'}
                    </span>
                  </div>
                  {(row.phone || row.email) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[row.phone, row.email].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {linked && (
          <p className="text-xs text-green-700">
            Existing {linked.kind === 'guest' ? 'guest' : 'organization'} selected:{' '}
            <strong>{linked.name}</strong>
          </p>
        )}
        {!linked && value.client_name.trim() && (
          <p className="text-xs text-amber-700">
            New client name (not linked to an existing guest or organization record)
          </p>
        )}
        {searching && (
          <p className="text-xs text-muted-foreground">Searching…</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input
            value={value.client_phone}
            onChange={(e) => {
              setLinked(null)
              onChange({ ...value, client_phone: e.target.value, guest_id: null })
            }}
            disabled={disabled || Boolean(linked)}
          />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input
            type="email"
            value={value.client_email}
            onChange={(e) => {
              setLinked(null)
              onChange({ ...value, client_email: e.target.value, guest_id: null })
            }}
            disabled={disabled || Boolean(linked)}
          />
        </div>
      </div>
    </div>
  )
}
