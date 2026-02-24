'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Edit, Trash2, Save, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import { format } from 'date-fns'

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
  created_by?: string
}

interface CreatedByProfile {
  email?: string
  first_name?: string
  last_name?: string
}

export default function OrganizationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.id as string

  const [organization, setOrganization] = useState<Organization | null>(null)
  const [createdByProfile, setCreatedByProfile] = useState<CreatedByProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    org_type: 'ngo' as 'ngo' | 'government' | 'private' | 'other',
    email: '',
    phone: '',
    contact_person: '',
    address: '',
  })

  useEffect(() => {
    fetchOrganization()
  }, [orgId])

  const fetchOrganization = async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, org_type, email, phone, contact_person, address, current_balance, created_at, created_by')
        .eq('id', orgId)
        .single()

      if (error) throw error

      setOrganization(data)
      setFormData({
        name: data.name,
        org_type: data.org_type,
        email: data.email || '',
        phone: data.phone || '',
        contact_person: data.contact_person || '',
        address: data.address || '',
      })

      // Fetch creator profile if created_by exists
      if (data.created_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', data.created_by)
          .single()

        setCreatedByProfile(profile)
      }
    } catch (error: any) {
      toast.error(error.message || 'Organization not found')
      router.back()
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Organization name is required')
      return
    }

    try {
      setSaving(true)
      const supabase = createClient()

      const { error } = await supabase
        .from('organizations')
        .update({
          name: formData.name,
          org_type: formData.org_type,
          email: formData.email || null,
          phone: formData.phone || null,
          contact_person: formData.contact_person || null,
          address: formData.address || null,
        })
        .eq('id', orgId)

      if (error) throw error

      toast.success('Organization updated successfully')
      setIsEditing(false)
      fetchOrganization()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update organization')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!organization) return

    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Delete {organization.name}?</p>
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
              onClick={() => handleDeleteConfirm(t)}
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

  const handleDeleteConfirm = async (toastId: any) => {
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
      router.push('/organizations')
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading organization...</p>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Organization not found</p>
      </div>
    )
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
            <h1 className="text-3xl font-bold">{organization.name}</h1>
            <Badge className={`mt-2 ${getOrgTypeColor(organization.org_type)}`}>
              {getOrgTypeLabel(organization.org_type)}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false)
                  setFormData({
                    name: organization.name,
                    org_type: organization.org_type,
                    email: organization.email || '',
                    phone: organization.phone || '',
                    contact_person: organization.contact_person || '',
                    address: organization.address || '',
                  })
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Organization Info */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Organization Name</Label>
                  {isEditing ? (
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium mt-1">{formData.name}</p>
                  )}
                </div>

                <div>
                  <Label className="text-muted-foreground">Organization Type</Label>
                  {isEditing ? (
                    <Select value={formData.org_type} onValueChange={(value: any) => setFormData({ ...formData, org_type: value })}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ngo">NGO</SelectItem>
                        <SelectItem value="government">Government</SelectItem>
                        <SelectItem value="private">Private Company</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium mt-1">{getOrgTypeLabel(formData.org_type)}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Contact Person</Label>
                  {isEditing ? (
                    <Input
                      placeholder="Name of contact person"
                      value={formData.contact_person}
                      onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium mt-1">{formData.contact_person || '—'}</p>
                  )}
                </div>

                <div>
                  <Label className="text-muted-foreground">Email Address</Label>
                  {isEditing ? (
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium mt-1">{formData.email || '—'}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Phone Number</Label>
                  {isEditing ? (
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium mt-1">{formData.phone || '—'}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Address</Label>
                {isEditing ? (
                  <Textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={3}
                  />
                ) : (
                  <p className="font-medium mt-1 whitespace-pre-wrap">{formData.address || '—'}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Balance Card */}
          <Card>
            <CardHeader>
              <CardTitle>City Ledger Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {formatNaira(organization.current_balance)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">Current account balance</p>
            </CardContent>
          </Card>

          {/* Meta Information */}
          <Card>
            <CardHeader>
              <CardTitle>Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Created On</p>
                <p className="font-medium">
                  {format(new Date(organization.created_at), 'MMM dd, yyyy')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(organization.created_at), 'hh:mm a')}
                </p>
              </div>

              {createdByProfile && (
                <div>
                  <p className="text-muted-foreground">Created By</p>
                  <p className="font-medium">
                    {createdByProfile.first_name && createdByProfile.last_name
                      ? `${createdByProfile.first_name} ${createdByProfile.last_name}`
                      : createdByProfile.email}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
