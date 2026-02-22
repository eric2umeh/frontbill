'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { AddOrganizationModal } from '@/components/organizations/add-organization-modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { Building2, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Organization {
  id: string
  name: string
  type: string
  contact_person: string
  email: string
  phone: string
  balance: number
  status: string
  credit_limit: number
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [addOrgModalOpen, setAddOrgModalOpen] = useState(false)
  const router = useRouter()
  
  useEffect(() => {
    fetchOrganizations()
  }, [])

  const fetchOrganizations = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setOrganizations([])
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setOrganizations([])
        return
      }

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setOrganizations(data || [])
    } catch (error: any) {
      console.error('Error fetching organizations:', error)
      setOrganizations([])
    } finally {
      setLoading(false)
    }
  }
  
  const typeColors = {
    government: 'bg-blue-500/10 text-blue-700 border-blue-200',
    private: 'bg-green-500/10 text-green-700 border-green-200',
    ngo: 'bg-purple-500/10 text-purple-700 border-purple-200',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AddOrganizationModal 
        open={addOrgModalOpen} 
        onClose={() => { setAddOrgModalOpen(false); fetchOrganizations() }}
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
        data={organizations}
        searchKeys={['name', 'contact_person', 'email']}
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
                onClick={() => router.push(`/organizations/${org.id}`)}
              >
                <div className="font-semibold">{org.name}</div>
                <div className="text-xs text-muted-foreground">{org.contact_person}</div>
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
                onClick={() => router.push(`/organizations/${org.id}`)}
              >
                {org.balance < 0 ? 'Debt: ' : org.balance > 0 ? 'Credit: ' : ''}{formatNaira(Math.abs(org.balance))}
              </div>
            ),
          },
        ]}
        renderCard={(org) => (
          <CardContent 
            className="p-4 cursor-pointer hover:bg-accent"
            onClick={() => router.push(`/organizations/${org.id}`)}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {org.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{org.contact_person}</div>
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
                  <div className="font-semibold">{formatNaira(org.credit_limit)}</div>
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
