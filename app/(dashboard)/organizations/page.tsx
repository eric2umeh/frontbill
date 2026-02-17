'use client'

import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { Building2, Plus, Eye } from 'lucide-react'

// Mock organizations with zero balance start
const mockOrganizations = [
  { id: '1', name: 'Federal Ministry of Health', type: 'government', contactPerson: 'Dr. Adewale Johnson', email: 'adewale@health.gov.ng', phone: '+234 803 456 7890', balance: 0, creditLimit: 5000000, status: 'active' },
  { id: '2', name: 'Shell Nigeria Ltd', type: 'private', contactPerson: 'Mrs. Fatima Bello', email: 'fatima.bello@shell.com.ng', phone: '+234 805 234 5678', balance: 0, creditLimit: 10000000, status: 'active' },
  { id: '3', name: 'United Nations Development Programme', type: 'ngo', contactPerson: 'Mr. John Smith', email: 'john.smith@undp.org', phone: '+234 802 345 6789', balance: 0, creditLimit: 8000000, status: 'active' },
  { id: '4', name: 'Lagos State Government', type: 'government', contactPerson: 'Hon. Ngozi Okonjo', email: 'ngozi@lagosstate.gov.ng', phone: '+234 806 789 0123', balance: 0, creditLimit: 7000000, status: 'active' },
  { id: '5', name: 'TotalEnergies Nigeria', type: 'private', contactPerson: 'Mr. Pierre Dubois', email: 'pierre.dubois@totalenergies.com', phone: '+234 807 890 1234', balance: 0, creditLimit: 9000000, status: 'active' },
  { id: '6', name: 'Red Cross Nigeria', type: 'ngo', contactPerson: 'Mrs. Aisha Mohammed', email: 'aisha@redcross.org.ng', phone: '+234 808 901 2345', balance: 0, creditLimit: 3000000, status: 'active' },
  { id: '7', name: 'Dangote Group', type: 'private', contactPerson: 'Alhaji Sani Dangote', email: 'sani@dangote.com', phone: '+234 809 012 3456', balance: 0, creditLimit: 15000000, status: 'active' },
  { id: '8', name: 'World Health Organization', type: 'ngo', contactPerson: 'Dr. Sarah Williams', email: 'sarah.williams@who.int', phone: '+234 810 123 4567', balance: 0, creditLimit: 6000000, status: 'active' },
]

export default function OrganizationsPage() {
  const typeColors = {
    government: 'bg-blue-500/10 text-blue-700 border-blue-200',
    private: 'bg-green-500/10 text-green-700 border-green-200',
    ngo: 'bg-purple-500/10 text-purple-700 border-purple-200',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">
            Manage corporate, government, and NGO accounts with city ledger
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Organization
        </Button>
      </div>

      <EnhancedDataTable
        data={mockOrganizations}
        searchKeys={['name', 'contactPerson', 'email']}
        filters={[
          {
            key: 'type',
            label: 'Type',
            options: [
              { value: 'government', label: 'Government' },
              { value: 'private', label: 'Private' },
              { value: 'ngo', label: 'NGO' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
        ]}
        columns={[
          {
            key: 'name',
            label: 'Organization',
            render: (org) => (
              <div>
                <div className="font-semibold">{org.name}</div>
                <div className="text-xs text-muted-foreground">{org.contactPerson}</div>
              </div>
            ),
          },
          {
            key: 'type',
            label: 'Type',
            render: (org) => (
              <Badge variant="outline" className={typeColors[org.type as keyof typeof typeColors]}>
                {org.type.toUpperCase()}
              </Badge>
            ),
          },
          {
            key: 'balance',
            label: 'Balance',
            render: (org) => (
              <div className={`font-semibold ${org.balance > 0 ? 'text-green-600' : org.balance < 0 ? 'text-red-600' : ''}`}>
                {formatNaira(org.balance)}
              </div>
            ),
          },
          {
            key: 'creditLimit',
            label: 'Credit Limit',
            render: (org) => <div className="text-sm">{formatNaira(org.creditLimit)}</div>,
          },
          {
            key: 'actions',
            label: '',
            render: (org) => (
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
              </Button>
            ),
          },
        ]}
        renderCard={(org) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {org.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{org.contactPerson}</div>
                </div>
                <Badge variant="outline" className={typeColors[org.type as keyof typeof typeColors]}>
                  {org.type.toUpperCase()}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Balance</div>
                  <div className={`font-semibold ${org.balance > 0 ? 'text-green-600' : org.balance < 0 ? 'text-red-600' : ''}`}>
                    {formatNaira(org.balance)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Credit Limit</div>
                  <div className="font-semibold">{formatNaira(org.creditLimit)}</div>
                </div>
              </div>
              <div className="pt-2 border-t text-sm text-muted-foreground">
                <div>{org.email}</div>
                <div>{org.phone}</div>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={10}
      />
    </div>
  )
}
