'use client'

import { Organization } from '@/lib/types/database'
import { DataTable, Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { formatNaira } from '@/lib/utils/currency'

interface OrganizationsTableProps {
  organizations: Organization[]
}

export function OrganizationsTable({ organizations }: OrganizationsTableProps) {
  const typeColors: Record<string, string> = {
    government: 'bg-blue-100 text-blue-800',
    ngo: 'bg-green-100 text-green-800',
    private: 'bg-purple-100 text-purple-800',
    individual: 'bg-gray-100 text-gray-800',
  }

  const columns: Column<Organization>[] = [
    {
      header: 'Name',
      accessor: 'name',
      cell: (value, org) => (
        <div>
          <p className="font-medium">{value}</p>
          {org.contact_person && (
            <p className="text-xs text-muted-foreground">{org.contact_person}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      cell: (value) => (
        <Badge className={typeColors[value]} variant="secondary">
          {value.toUpperCase()}
        </Badge>
      ),
      className: 'hidden md:table-cell',
    },
    {
      header: 'Contact',
      accessor: 'phone',
      cell: (value, org) => (
        <div className="space-y-0.5 text-sm">
          <p>{value}</p>
          {org.email && (
            <p className="text-xs text-muted-foreground">{org.email}</p>
          )}
        </div>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      header: 'Outstanding',
      accessor: 'outstanding_balance',
      cell: (value) => (
        <span className={`font-semibold ${value > 0 ? 'text-red-600' : 'text-green-600'}`}>
          {formatNaira(value)}
        </span>
      ),
    },
    {
      header: 'Credit Limit',
      accessor: 'credit_limit',
      cell: (value) => formatNaira(value),
      className: 'hidden xl:table-cell',
    },
  ]

  return <DataTable columns={columns} data={organizations} pageSize={15} />
}
