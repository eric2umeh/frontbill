'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isOrganizationMenuRecord } from '@/lib/utils/ledger-organization'
import { Loader2, Plus, X } from 'lucide-react'

export type EventClientType = 'guest' | 'organization'

export type EventClientValue = {
  client_type: EventClientType
  client_name: string
  client_phone: string
  client_email: string
  client_address: string
  guest_id: string | null
  client_organization_id: string | null
  org_type: string
  contact_person: string
}

type GuestRow = { id: string; name: string; phone: string; email: string; address?: string }
type OrgRow = { id: string; name: string; phone: string; email: string; org_type?: string }

type Props = {
  organizationId: string
  value: EventClientValue
  onChange: (next: EventClientValue) => void
  disabled?: boolean
}

const ORG_TYPES = [
  { value: 'corporate', label: 'Corporate' },
  { value: 'government', label: 'Government' },
  { value: 'ngo', label: 'NGO / Non-profit' },
  { value: 'other', label: 'Other' },
]

export function EventClientSearchField({
  organizationId,
  value,
  onChange,
  disabled,
}: Props) {
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [guestSuggestions, setGuestSuggestions] = useState<GuestRow[]>([])
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)
  const [linkedGuest, setLinkedGuest] = useState<GuestRow | null>(null)

  const [orgResults, setOrgResults] = useState<OrgRow[]>([])
  const [orgSearchOpen, setOrgSearchOpen] = useState(false)
  const [orgSearching, setOrgSearching] = useState(false)
  const [linkedOrg, setLinkedOrg] = useState<OrgRow | null>(null)
  const [showNewOrgForm, setShowNewOrgForm] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    const supabase = createClient()
    if (!supabase) return
    void (async () => {
      const { data } = await supabase
        .from('guests')
        .select('id, name, phone, email, address')
        .eq('organization_id', organizationId)
        .order('name')
        .limit(500)
      setGuests(
        (data ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          phone: g.phone || '',
          email: g.email || '',
          address: g.address || '',
        })),
      )
    })()
  }, [organizationId])

  useEffect(() => {
    if (value.client_type === 'guest' && value.guest_id) {
      const g = guests.find((x) => x.id === value.guest_id)
      setLinkedGuest(g || { id: value.guest_id, name: value.client_name, phone: value.client_phone, email: value.client_email })
    } else {
      setLinkedGuest(null)
    }
    if (value.client_type === 'organization' && value.client_organization_id && value.client_name) {
      setLinkedOrg({
        id: value.client_organization_id,
        name: value.client_name,
        phone: value.client_phone,
        email: value.client_email,
      })
    } else if (value.client_type !== 'organization') {
      setLinkedOrg(null)
    }
  }, [value.client_type, value.guest_id, value.client_organization_id, value.client_name, value.client_phone, value.client_email, guests])

  const patch = (partial: Partial<EventClientValue>) => onChange({ ...value, ...partial })

  const switchClientType = (t: EventClientType) => {
    setLinkedGuest(null)
    setLinkedOrg(null)
    setShowNewOrgForm(false)
    setGuestSearchOpen(false)
    setOrgSearchOpen(false)
    onChange({
      client_type: t,
      client_name: '',
      client_phone: '',
      client_email: '',
      client_address: '',
      guest_id: null,
      client_organization_id: null,
      org_type: value.org_type || 'other',
      contact_person: '',
    })
  }

  const searchGuests = (term: string) => {
    patch({ client_name: term, guest_id: null })
    setLinkedGuest(null)
    const q = term.trim().toLowerCase()
    if (!q) {
      setGuestSuggestions([])
      setGuestSearchOpen(false)
      return
    }
    const hits = guests.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.phone || '').includes(term.trim()),
    )
    setGuestSuggestions(hits.slice(0, 12))
    setGuestSearchOpen(hits.length > 0)
  }

  const selectGuest = (g: GuestRow) => {
    setLinkedGuest(g)
    patch({
      client_name: g.name,
      client_phone: g.phone,
      client_email: g.email,
      client_address: g.address || '',
      guest_id: g.id,
      client_organization_id: null,
    })
    setGuestSearchOpen(false)
  }

  const searchOrgs = async (term: string) => {
    patch({ client_name: term, client_organization_id: null })
    setLinkedOrg(null)
    const q = term.trim()
    if (!q) {
      setOrgResults([])
      setOrgSearchOpen(false)
      return
    }
    setOrgSearching(true)
    try {
      const supabase = createClient()
      if (!supabase) return
      const { data } = await supabase
        .from('organizations')
        .select('id, name, phone, email, org_type, created_by')
        .neq('id', organizationId)
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(12)
      const hits = (data ?? [])
        .filter((o) => isOrganizationMenuRecord(o, organizationId))
        .map((o) => ({
          id: o.id,
          name: o.name,
          phone: o.phone || '',
          email: o.email || '',
          org_type: o.org_type,
        }))
      setOrgResults(hits)
      setOrgSearchOpen(hits.length > 0)
    } finally {
      setOrgSearching(false)
    }
  }

  const selectOrg = (o: OrgRow) => {
    setLinkedOrg(o)
    setShowNewOrgForm(false)
    patch({
      client_name: o.name,
      client_phone: o.phone,
      client_email: o.email,
      client_organization_id: o.id,
      guest_id: null,
      org_type: o.org_type || value.org_type,
    })
    setOrgSearchOpen(false)
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <p className="text-sm font-semibold">Client</p>
      <div className="space-y-2">
        <Label>Client type</Label>
        <Select
          value={value.client_type}
          onValueChange={(v) => switchClientType(v as EventClientType)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="guest">Guest (individual)</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.client_type === 'guest' ? (
        <>
          <div className="space-y-1">
            <Label>Guest name *</Label>
            <div className="relative">
              <Input
                placeholder="Type name — existing guests will appear"
                value={value.client_name}
                onChange={(e) => searchGuests(e.target.value)}
                onBlur={() => setTimeout(() => setGuestSearchOpen(false), 150)}
                disabled={disabled}
              />
              {guestSearchOpen && guestSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-background shadow-lg">
                  {guestSuggestions.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectGuest(g)
                      }}
                    >
                      <div className="font-medium text-sm">{g.name}</div>
                      {(g.phone || g.email) && (
                        <div className="text-xs text-muted-foreground">
                          {[g.phone, g.email].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {linkedGuest && (
              <p className="text-xs text-green-700">
                Existing guest: <strong>{linkedGuest.name}</strong>
              </p>
            )}
            {!linkedGuest && value.client_name.trim() && (
              <p className="text-xs text-amber-700">
                New guest will be created in the guest database when you save this event.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={value.client_phone}
                onChange={(e) => {
                  setLinkedGuest(null)
                  patch({ client_phone: e.target.value, guest_id: null })
                }}
                disabled={disabled || Boolean(linkedGuest)}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={value.client_email}
                onChange={(e) => {
                  setLinkedGuest(null)
                  patch({ client_email: e.target.value, guest_id: null })
                }}
                disabled={disabled || Boolean(linkedGuest)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Input
              value={value.client_address}
              onChange={(e) => {
                setLinkedGuest(null)
                patch({ client_address: e.target.value, guest_id: null })
              }}
              disabled={disabled || Boolean(linkedGuest)}
              placeholder="Optional — saved on new guest profile"
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label>Organization *</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              disabled={disabled}
              onClick={() => {
                setShowNewOrgForm((v) => !v)
                if (!showNewOrgForm) {
                  patch({ client_organization_id: null })
                  setLinkedOrg(null)
                }
              }}
            >
              <Plus className="h-3 w-3" />
              New organization
            </Button>
          </div>

          {!showNewOrgForm && (
            <div className="relative space-y-1">
              <Input
                placeholder="Search organization database…"
                value={value.client_name}
                onChange={(e) => void searchOrgs(e.target.value)}
                onBlur={() => setTimeout(() => setOrgSearchOpen(false), 150)}
                disabled={disabled}
              />
              {orgSearching && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {orgSearchOpen && orgResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-background shadow-lg">
                  {orgResults.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="w-full border-b px-4 py-2 text-left last:border-b-0 hover:bg-accent text-sm"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectOrg(o)
                      }}
                    >
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[o.phone, o.email].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {linkedOrg && (
                <p className="text-xs text-green-700">
                  Organization selected: <strong>{linkedOrg.name}</strong>
                </p>
              )}
              {value.client_name.trim() && !linkedOrg && !orgSearching && orgResults.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No organization found. Use &quot;New organization&quot; to add one.
                </p>
              )}
            </div>
          )}

          {showNewOrgForm && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Create new organization</p>
                <button type="button" onClick={() => setShowNewOrgForm(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Organization name *</Label>
                <Input
                  value={value.client_name}
                  onChange={(e) => patch({ client_name: e.target.value, client_organization_id: null })}
                  placeholder="e.g. Federal Ministry of Health"
                  disabled={disabled}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={value.org_type || 'other'}
                    onValueChange={(v) => patch({ org_type: v })}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact person</Label>
                  <Input
                    value={value.contact_person}
                    onChange={(e) => patch({ contact_person: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={value.client_phone}
                    onChange={(e) => patch({ client_phone: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={value.client_email}
                    onChange={(e) => patch({ client_email: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              </div>
              <p className="text-xs text-amber-700">
                Saved to the organization database (and city ledger) when you create this event.
              </p>
            </div>
          )}

          {!showNewOrgForm && linkedOrg && (
            <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
              <div>
                <span className="text-xs block">Phone</span>
                {linkedOrg.phone || '—'}
              </div>
              <div>
                <span className="text-xs block">Email</span>
                {linkedOrg.email || '—'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
