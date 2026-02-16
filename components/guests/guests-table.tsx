'use client'

import { Guest } from '@/lib/types/database'
import { DataTable, Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Phone, Mail } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface GuestsTableProps {
  guests: Guest[]
}

export function GuestsTable({ guests }: GuestsTableProps) {
  const columns: Column<Guest>[] = [
    {
      header: 'Name',
      accessor: (guest) => `${guest.first_name} ${guest.last_name}`,
      cell: (_, guest) => (
        <div>
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
      cell: (_, guest) => (
        <div className="space-y-1">
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
      className: 'hidden md:table-cell',
    },
    {
      header: 'Status',
      accessor: (guest) => guest.is_active,
      cell: (value) => (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      header: '',
      accessor: (guest) => guest.id,
      cell: (_, guest) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View Details</DropdownMenuItem>
            <DropdownMenuItem>Edit Guest</DropdownMenuItem>
            <DropdownMenuItem>New Booking</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Deactivate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'w-[50px]',
    },
  ]

  return <DataTable columns={columns} data={guests} pageSize={10} />
}
