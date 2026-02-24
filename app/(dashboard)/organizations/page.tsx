'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Building2, MoreVertical, Edit, Trash2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface Organization {
  id: string
  name: string
  org_type: 'ngo' | 'government' | 'private'
  email: string
  phone?: string
  current_balance: number
  created_at: string
}

export default function OrganizationsPage() {
  const router = useRouter()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [addOrgModalOpen, setAddOrgModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    org_type: 'ngo' as 'ngo' | 'government' | 'private',
    email: '',
    phone: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchOrganizations()
  }, [])

  const fetchOrganizations = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, org_type, email, phone, current_balance, created_at')
        .not('name', 'like', '%Hotel%') // Exclude user hotels
        .order('created_at', { ascending: false })

      if (error) throw error
      setOrganizations(data || [])
    } catch (error: any) {
      toast.error(error.message || 'Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }

  const handleAddOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Please fill in name and email')
      return
    }

    try {
      setSubmitting(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('organizations')
        .insert([{
          name: formData.name,
          org_type: formData.org_type,
          email: formData.email,
          phone: formData.phone || null,
          current_balance: 0,
        }])
        .select()

      if (error) throw error

      toast.success(`${formData.org_type.toUpperCase()} "${formData.name}" created successfully`)
      setFormData({ name: '', org_type: 'ngo', email: '', phone: '' })
      setAddOrgModalOpen(false)
      fetchOrganizations()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create organization')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (org: Organization) => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Delete {org.name}?</p>
              <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.dismiss(t)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteLoading}
              onClick={() => handleDeleteConfirm(org.id, t)}
            >
              Delete
            </Button>
          </div>
        </div>
      ),
      {
        duration: Infinity,
        className: 'bg-red-50 border-red-200',
      }
    )
  }

  const handleDeleteConfirm = async (orgId: string, toastId: any) => {
    try {
      setDeleteLoading(true)
      const supabase = createClient()
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId)

      if (error) throw error
      
      toast.success('Organization deleted successfully')
      toast.dismiss(toastId)
      fetchOrganizations()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete organization')
    } finally {
      setDeleteLoading(false)
    }
  }

  const getOrgTypeLabel = (type: string) => {
    const labels = {
      ngo: 'NGO',
      government: 'Government',
      private: 'Private Company',
    }
    return labels[type as keyof typeof labels] || type
  }

  const getOrgTypeColor = (type: string) => {
    const colors = {
      ngo: 'bg-blue-100 text-blue-800',
      government: 'bg-purple-100 text-purple-800',
      private: 'bg-green-100 text-green-800',
    }
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Organization</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddOrganization} className="space-y-4">
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
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Email Address *</Label>
                  <Input
                    type="email"
                    placeholder="contact@organization.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    placeholder="+234 800 000 0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 justify-end pt-4">
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

        {/* Organizations List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading organizations...</p>
          </div>
        ) : organizations.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No organizations created yet</p>
              <Button onClick={() => setAddOrgModalOpen(true)}>
                Create First Organization
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {organizations.map((org) => (
              <Card key={org.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{org.name}</CardTitle>
                      <div className="flex gap-2 mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${getOrgTypeColor(org.org_type)}`}>
                          {getOrgTypeLabel(org.org_type)}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(org)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium break-all">{org.email}</p>
                  </div>
                  {org.phone && (
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-medium">{org.phone}</p>
                    </div>
                  )}
                  <div className="bg-blue-50 rounded p-3 border border-blue-200">
                    <p className="text-xs text-muted-foreground">City Ledger Balance</p>
                    <p className="text-lg font-bold text-blue-900">{formatNaira(org.current_balance)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
