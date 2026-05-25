'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import type { OutletClientOption, OutletClientOptionKind } from '@/lib/outlets/types'

export type OutletRoomOption = {
  id: string
  room_number: string
  status: string
  booking: {
    id: string
    guest_name: string | null
    folio_id: string | null
  } | null
}

type LedgerOption = { id: string; name: string; balance: number }

type Props = {
  organizationId: string
  guestName: string
  onGuestNameChange: (name: string) => void
  onClientSelect?: (client: OutletClientOption | null) => void
  roomNumber: string
  onRoomNumberChange: (room: string) => void
  onRoomBookingLink?: (payload: {
    bookingId: string | null
    guestName: string | null
    label: string | null
  }) => void
  selectedLedger: LedgerOption | null
  onLedgerSelect?: (ledger: LedgerOption | null) => void
}

const kindLabel: Record<OutletClientOptionKind, string> = {
  guest: 'Guest',
  organization: 'Organization',
  ledger: 'Ledger',
}

export function OutletOrderCustomerFields({
  organizationId,
  guestName,
  onGuestNameChange,
  onClientSelect,
  roomNumber,
  onRoomNumberChange,
  onRoomBookingLink,
  selectedLedger,
  onLedgerSelect,
}: Props) {
  const [clientOptions, setClientOptions] = useState<OutletClientOption[]>([])
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const [clientSearching, setClientSearching] = useState(false)

  const [roomOptions, setRoomOptions] = useState<OutletRoomOption[]>([])
  const [roomSearchOpen, setRoomSearchOpen] = useState(false)
  const [roomSearching, setRoomSearching] = useState(false)

  const clientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAutoRoomRef = useRef<string | null>(null)

  const searchClients = useCallback(
    async (term: string) => {
      if (!organizationId || term.trim().length < 1) {
        setClientOptions([])
        return
      }
      setClientSearching(true)
      try {
        const res = await fetch(
          `/api/outlets/lookup-clients?q=${encodeURIComponent(term.trim())}`,
          { headers: await outletApiHeaders(), credentials: 'include' },
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setClientOptions([])
          return
        }
        setClientOptions(json.clients ?? [])
      } finally {
        setClientSearching(false)
      }
    },
    [organizationId],
  )

  const searchRooms = useCallback(
    async (term: string) => {
      if (!organizationId) return
      setRoomSearching(true)
      try {
        const qs = term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''
        const res = await fetch(`/api/outlets/rooms${qs}`, {
          headers: await outletApiHeaders(),
          credentials: 'include',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setRoomOptions([])
          return
        }
        setRoomOptions(json.rooms ?? [])
      } finally {
        setRoomSearching(false)
      }
    },
    [organizationId],
  )

  useEffect(() => {
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    const term = guestName.trim()
    if (term.length < 1) {
      setClientOptions([])
      return
    }
    clientDebounceRef.current = setTimeout(() => void searchClients(term), 280)
    return () => {
      if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    }
  }, [guestName, searchClients])

  useEffect(() => {
    if (roomDebounceRef.current) clearTimeout(roomDebounceRef.current)
    roomDebounceRef.current = setTimeout(() => void searchRooms(roomNumber), 280)
    return () => {
      if (roomDebounceRef.current) clearTimeout(roomDebounceRef.current)
    }
  }, [roomNumber, searchRooms])

  const applyRoomSelection = (room: OutletRoomOption) => {
    onRoomNumberChange(room.room_number)
    setRoomSearchOpen(false)
    if (room.booking) {
      const guest = room.booking.guest_name?.trim() || null
      onRoomBookingLink?.({
        bookingId: room.booking.id,
        guestName: guest,
        label: guest
          ? `${guest} · Room ${room.room_number}`
          : `Room ${room.room_number} (in-house)`,
      })
      if (guest) onGuestNameChange(guest)
    } else {
      onRoomBookingLink?.({
        bookingId: null,
        guestName: null,
        label: null,
      })
    }
  }

  const tryApplyRoomByExactNumber = () => {
    const term = roomNumber.trim().toLowerCase()
    if (!term) return
    const exact = roomOptions.find(
      (r) => String(r.room_number).trim().toLowerCase() === term,
    )
    if (exact) applyRoomSelection(exact)
  }

  useEffect(() => {
    const term = roomNumber.trim().toLowerCase()
    if (!term || roomOptions.length !== 1) return
    const only = roomOptions[0]
    const num = String(only.room_number).trim().toLowerCase()
    if (num !== term || !only.booking) return
    const key = `${only.id}:${only.booking.id}`
    if (lastAutoRoomRef.current === key) return
    lastAutoRoomRef.current = key
    applyRoomSelection(only)
  }, [roomNumber, roomOptions])

  const selectClient = (client: OutletClientOption) => {
    onGuestNameChange(client.name)
    onClientSelect?.(client)
    setClientSearchOpen(false)
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label>Room # (optional)</Label>
        <div className="relative">
          <Input
            value={roomNumber}
            onChange={(e) => {
              lastAutoRoomRef.current = null
              onRoomNumberChange(e.target.value)
              onRoomBookingLink?.({ bookingId: null, guestName: null, label: null })
              setRoomSearchOpen(true)
            }}
            onFocus={() => {
              setRoomSearchOpen(true)
              void searchRooms(roomNumber)
            }}
            onBlur={() => {
              setTimeout(() => {
                setRoomSearchOpen(false)
                tryApplyRoomByExactNumber()
              }, 150)
            }}
            placeholder="In-house guests only"
            autoComplete="off"
          />
          {roomSearching && (
            <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {roomSearchOpen && roomOptions.length > 0 && (
            <ul className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-lg max-h-48 overflow-y-auto text-sm">
              {roomOptions.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-b-0"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applyRoomSelection(r)
                    }}
                  >
                    <span className="font-medium">Room {r.room_number}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {r.booking?.guest_name
                        ? `In-house · ${r.booking.guest_name}`
                        : 'No in-house guest on this room'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the room number first — guest name fills in automatically when the room is occupied.
        </p>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Guest / client name (optional)</Label>
        <div className="relative">
          <Input
            value={guestName}
            onChange={(e) => {
              onGuestNameChange(e.target.value)
              onClientSelect?.(null)
              if (onLedgerSelect && selectedLedger) onLedgerSelect(null)
              setClientSearchOpen(true)
            }}
            onFocus={() => setClientSearchOpen(true)}
            onBlur={() => setTimeout(() => setClientSearchOpen(false), 150)}
            placeholder="Walk-in optional — search guest or organization"
            autoComplete="off"
          />
          {clientSearching && (
            <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {clientSearchOpen && clientOptions.length > 0 && (
            <ul className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-lg max-h-48 overflow-y-auto text-sm">
              {clientOptions.map((c) => (
                <li key={`${c.kind}-${c.id}`}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-b-0"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectClient(c)
                    }}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {kindLabel[c.kind]}
                      {c.subtitle ? ` · ${c.subtitle}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Leave blank for walk-ins. Charge-to-room needs an in-house room, a guest name, or a city ledger account under
          Payment.
        </p>
      </div>
    </div>
  )
}
