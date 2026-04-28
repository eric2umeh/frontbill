'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import { calculateOrganizationBalancesBatch } from '@/lib/balance'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { isOrganizationMenuRecord } from '@/lib/utils/ledger-organization'
import { getUserDisplayName } from '@/lib/utils/user-display'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'

interface Organization {
  id: string
  name: string
  org_type: 'ngo' | 'government' | 'private' | 'other'
  email?: string
  phone?: string
  contact_person?: string
  address?: string
  current_balance: number
  created_at: string
  created_by_name?: string
}

export default function OrganizationsPage() {
  const router = useRouter()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { userId, organizationId } = useAuth()
  const [addOrgModalOpen, setAddOrgModalOpen] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    org_type: 'ngo' as 'ngo' | 'government' | 'private' | 'other',
    email: '',
    phone: '',
    contact_person: '',
    address: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchOrganizations()
  }, [])

  const fetchOrganizations = async () => {
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) { setOrganizations([]); endFetch(); return }

      // Fetch organizations
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, org_type, email, phone, contact_person, address, current_balance, created_at, created_by')
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Show organizations created from the Organizations menu, regardless of which team role created them.
      const menuOrganizations = (data || []).filter((org: any) => isOrganizationMenuRecord(org))
      const orgIds = menuOrganizations.map((org: any) => org.id)
      const balanceMap = await calculateOrganizationBalancesBatch(supabase, orgIds)
      
      // Fetch creator profiles for all organizations
      const creatorIds = Array.from(new Set(menuOrganizations.map((org: any) => org.created_by).filter(Boolean)))
      const creatorMap = await fetchUserDisplayNameMap(creatorIds as string[], userId)
      
      // Transform the data with dynamic balance calculation
      const transformed = menuOrganizations.map((org: any) => ({
        ...org,
        current_balance: balanceMap[org.id] || 0,
        created_by_name: org.created_by ? creatorMap[org.created_by] || getUserDisplayName(null, org.created_by) : 'System'
      }))
      
      setOrganizations(transformed)
    } catch (error: any) {
      console.error('Error fetching organizations:', error)
      toast.error(error.message || 'Failed to load organizations')
    } finally {
      endFetch()
    }
  }

  const handleAddOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast.error('Please fill in organization name')
      return
    }

    try {
      setSubmitting(true)
      const supabase = createClient()
      if (!supabase) { toast.error('Database not configured'); setSubmitting(false); return }

      const { error } = await supabase
        .from('organizations')
        .insert([{
          name: formData.name,
          org_type: formData.org_type,
          email: formData.email || null,
          phone: formData.phone || null,
          contact_person: formData.contact_person || null,
          address: formData.address || null,
          current_balance: 0,
          created_by: userId,
        }])

      if (error) throw error

      toast.success(`${formData.org_type.charAt(0).toUpperCase() + formData.org_type.slice(1)} "${formData.name}" created successfully`)
      setFormData({ name: '', org_type: 'ngo', email: '', phone: '', contact_person: '', address: '' })
      setAddOrgModalOpen(false)
      fetchOrganizations()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create organization')
    } finally {
      setSubmitting(false)
    }
  }

  const getOrgTypeLabel = (type: string) => {
    const labels = {
      ngo: 'NGO',
      government: 'Government',
      private: 'Private Company',
      other: 'Other',
    }
    return labels[type as keyof typeof labels] || type
  }

  const getOrgTypeColor = (type: string) => {
    const colors = {
      ngo: 'bg-blue-100 text-blue-800',
      government: 'bg-purple-100 text-purple-800',
      private: 'bg-green-100 text-green-800',
      other: 'bg-gray-100 text-gray-800',
    }
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Organizations</h1>
            <p className="text-muted-foreground">Manage NGOs, Government, and Private organizations for city ledger billing</p>
          </div>
        </div>
        <Dialog open={addOrgModalOpen} onOpenChange={setAddOrgModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddOrganization} className="space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Organization Name *</Label>
                  <Input
                    placeholder="e.g., Red Cross Nigeria"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Organization Type *</Label>
                  <Select value={formData.org_type} onValueChange={(value: any) => setFormData({ ...formData, org_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ngo">NGO</SelectItem>
                      <SelectItem value="government">Government</SelectItem>
                      <SelectItem value="private">Private Company</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Person</Label>
                  <Input
                    placeholder="Name of contact person"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="contact@organization.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    placeholder="+234 800 000 0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  placeholder="Street address, city, state"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setAddOrgModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Organization'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Data Table */}
      {initialLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading organizations...</p>
        </div>
      ) : (
        <EnhancedDataTable
          data={organizations}
          searchKeys={['name', 'email', 'contact_person', 'phone']}
          filters={[
            {
              key: 'org_type',
              label: 'Organization Type',
              options: [
                { value: 'ngo', label: 'NGO' },
                { value: 'government', label: 'Government' },
                { value: 'private', label: 'Private Company' },
                { value: 'other', label: 'Other' },
              ],
            },
          ]}
          columns={[
            {
              key: 'name',
              label: 'Name',
              render: (org) => (
                <div 
                  className="cursor-pointer hover:text-primary font-medium"
                  onClick={() => router.push(`/organizations/${org.id}`)}
                >
                  {org.name}
                </div>
              ),
            },
            {
              key: 'org_type',
              label: 'Type',
              render: (org) => (
                <Badge className={getOrgTypeColor(org.org_type)}>
                  {getOrgTypeLabel(org.org_type)}
                </Badge>
              ),
            },
            {
              key: 'contact_person',
              label: 'Contact',
              render: (org) => (
                <div className="text-sm">
                  <div>{org.contact_person || '—'}</div>
                  <div className="text-muted-foreground">{org.phone || '—'}</div>
                </div>
              ),
            },
            {
              key: 'current_balance',
              label: 'Balance',
              render: (org) => (
                <div className="font-semibold text-blue-600">
                  {formatNaira(org.current_balance)}
                </div>
              ),
            },
            {
              key: 'created_at',
              label: 'Created',
              render: (org) => (
                <div className="text-sm">
                  <div>{format(new Date(org.created_at), 'MMM dd, yyyy')}</div>
                  <div className="text-muted-foreground text-xs">{org.created_by_name}</div>
                </div>
              ),
            },
          ]}
          renderCard={(org) => (
            <Card
              className="cursor-pointer hover:shadow-lg transition-shadow h-full"
              onClick={() => router.push(`/organizations/${org.id}`)}
            >
              <CardContent className="p-4 space-y-3">
                <div>
                  <div className="font-semibold text-lg">{org.name}</div>
                  <Badge className={`mt-2 ${getOrgTypeColor(org.org_type)}`}>
                    {getOrgTypeLabel(org.org_type)}
                  </Badge>
                </div>
                {org.contact_person && (
                  <div>
                    <p className="text-xs text-muted-foreground">Contact Person</p>
                    <p className="text-sm font-medium">{org.contact_person}</p>
                  </div>
                )}
                {org.email && (
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm break-all">{org.email}</p>
                  </div>
                )}
                {org.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm">{org.phone}</p>
                  </div>
                )}
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground">City Ledger Balance</p>
                  <p className="text-lg font-bold text-blue-600">{formatNaira(org.current_balance)}</p>
                </div>
                <div className="pt-2 text-xs text-muted-foreground">
                  Created by {org.created_by_name}
                </div>
              </CardContent>
            </Card>
          )}
          itemsPerPage={10}
        />
      )}
    </div>
  )
}
