'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { AddOrganizationModal } from '@/components/organizations/add-organization-modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { Building2, Plus } from 'lucide-react'

// Mock organizations with varied balances (negative = debt, positive = credit)
const mockOrganizations = [
  { id: '1', name: 'Federal Ministry of Health', type: 'government', contactPerson: 'Dr. Adewale Johnson', email: 'adewale@health.gov.ng', phone: '+234 803 456 7890', balance: -450000, status: 'active', creditLimit: 1000000 },
  { id: '2', name: 'Shell Nigeria Ltd', type: 'private', contactPerson: 'Mrs. Fatima Bello', email: 'fatima.bello@shell.com.ng', phone: '+234 805 234 5678', balance: 0, status: 'active', creditLimit: 2000000 },
  { id: '3', name: 'United Nations Development Programme', type: 'ngo', contactPerson: 'Mr. John Smith', email: 'john.smith@undp.org', phone: '+234 802 345 6789', balance: 120000, status: 'active', creditLimit: 800000 },
  { id: '4', name: 'Lagos State Government', type: 'government', contactPerson: 'Hon. Ngozi Okonjo', email: 'ngozi@lagosstate.gov.ng', phone: '+234 806 789 0123', balance: -875000, status: 'active', creditLimit: 1500000 },
  { id: '5', name: 'TotalEnergies Nigeria', type: 'private', contactPerson: 'Mr. Pierre Dubois', email: 'pierre.dubois@totalenergies.com', phone: '+234 807 890 1234', balance: 0, status: 'active', creditLimit: 2000000 },
  { id: '6', name: 'Red Cross Nigeria', type: 'ngo', contactPerson: 'Mrs. Aisha Mohammed', email: 'aisha@redcross.org.ng', phone: '+234 808 901 2345', balance: -200000, status: 'active', creditLimit: 500000 },
  { id: '7', name: 'Dangote Group', type: 'private', contactPerson: 'Alhaji Sani Dangote', email: 'sani@dangote.com', phone: '+234 809 012 3456', balance: 350000, status: 'active', creditLimit: 2500000 },
  { id: '8', name: 'World Health Organization', type: 'ngo', contactPerson: 'Dr. Sarah Williams', email: 'sarah.williams@who.int', phone: '+234 810 123 4567', balance: -100000, status: 'active', creditLimit: 600000 },
]

export default function OrganizationsPage() {
  const router = useRouter()
  const [addOrgModalOpen, setAddOrgModalOpen] = useState(false)
  
  const typeColors = {
    government: 'bg-blue-500/10 text-blue-700 border-blue-200',
    private: 'bg-green-500/10 text-green-700 border-green-200',
    ngo: 'bg-purple-500/10 text-purple-700 border-purple-200',
  }

  return (
    <div className="space-y-6">
      <AddOrganizationModal 
        open={addOrgModalOpen} 
        onClose={() => setAddOrgModalOpen(false)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">
            Manage corporate, government, and NGO accounts with city ledger
          </p>
        </div>
        <Button onClick={() => setAddOrgModalOpen(true)}>
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
              <div 
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(`/organizations/${org.id}?data=${encodeURIComponent(JSON.stringify(org))}`)}
              >
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
            key: 'email',
            label: 'Contact',
            render: (org) => (
              <div className="text-sm">
                <div>{org.email}</div>
                <div className="text-muted-foreground">{org.phone}</div>
              </div>
            ),
          },
          {
            key: 'balance',
            label: 'Balance',
            render: (org) => (
              <div 
                className={`font-semibold cursor-pointer ${org.balance > 0 ? 'text-green-600' : org.balance < 0 ? 'text-red-600' : ''}`}
                onClick={() => router.push(`/organizations/${org.id}?data=${encodeURIComponent(JSON.stringify(org))}`)}
              >
                {org.balance < 0 ? 'Debt: ' : org.balance > 0 ? 'Credit: ' : ''}{formatNaira(Math.abs(org.balance))}
              </div>
            ),
          },
        ]}
        renderCard={(org) => (
          <CardContent 
            className="p-4 cursor-pointer hover:bg-accent"
            onClick={() => router.push(`/organizations/${org.id}?data=${encodeURIComponent(JSON.stringify(org))}`)}
          >
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
