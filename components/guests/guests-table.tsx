'use client'

import { useRouter } from 'next/navigation'
import { Guest } from '@/lib/types/database'
import { DataTable, Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail } from 'lucide-react'

interface GuestsTableProps {
  guests: Guest[]
}

export function GuestsTable({ guests }: GuestsTableProps) {
  const router = useRouter()

  const handleRowClick = (guest: Guest) => {
    router.push(`/guests/${guest.id}`)
  }

  const columns: Column<Guest>[] = [
    {
      header: 'Name',
      accessor: (guest) => `${guest.first_name} ${guest.last_name}`,
      cell: (guest) => (
        <div className="cursor-pointer hover:text-primary" onClick={() => handleRowClick(guest)}>
          <p className="font-medium">{guest.first_name} {guest.last_name}</p>
          {guest.organization && (
            <p className="text-xs text-muted-foreground">{guest.organization.name}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Contact',
      accessor: (guest) => guest.phone,
      cell: (guest) => (
        <div className="space-y-1 cursor-pointer" onClick={() => handleRowClick(guest)}>
          <div className="flex items-center gap-1 text-sm">
            <Phone className="h-3 w-3 text-muted-foreground" />
            {guest.phone}
          </div>
          {guest.email && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              {guest.email}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Nationality',
      accessor: 'nationality',
      cell: (guest) => (
        <div className="cursor-pointer" onClick={() => handleRowClick(guest)}>
          {guest.nationality}
        </div>
      ),
      className: 'hidden md:table-cell',
    },
    {
      header: 'Status',
      accessor: (guest) => guest.is_active,
      cell: (guest) => (
        <div className="cursor-pointer" onClick={() => handleRowClick(guest)}>
          <Badge variant={guest.is_active ? 'default' : 'secondary'}>
            {guest.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      ),
      className: 'hidden lg:table-cell',
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={guests}
      pageSize={15}
      searchPlaceholder="Search name, phone, email…"
      searchMatch={(guest, query) => {
        const q = query.trim().toLowerCase()
        return (
          `${guest.first_name} ${guest.last_name}`.toLowerCase().includes(q) ||
          (guest.phone ?? '').toLowerCase().includes(q) ||
          (guest.email ?? '').toLowerCase().includes(q) ||
          (guest.nationality ?? '').toLowerCase().includes(q)
        )
      }}
      filters={[
        {
          key: 'is_active',
          label: 'Status',
          options: [
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ],
        },
      ]}
      filterMatch={(guest, key, value) => {
        if (key !== 'is_active') return undefined
        return String(guest.is_active) === value
      }}
      onRowClick={handleRowClick}
    />
  )
}
