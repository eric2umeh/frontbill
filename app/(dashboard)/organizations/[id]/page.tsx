'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Edit, Trash2, Save, X, AlertCircle, Wallet, ArrowDownCircle, ArrowUpCircle, CreditCard, Clock } from 'lucide-react'
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
import CityLedgerPaymentModal from '@/components/city-ledger/city-ledger-payment-modal'
import { calculateOrganizationBalancesBatch } from '@/lib/balance'
import { useAuth } from '@/lib/auth-context'
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
  created_by?: string
  updated_at?: string
  updated_by?: string
}

interface ProfileInfo {
  id?: string
  full_name?: string
}

export default function OrganizationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.id as string
  const { role, userId, organizationId: authTenantOrgId } = useAuth()
  const isSuperadmin = role === 'superadmin'

  const [organization, setOrganization] = useState<Organization | null>(null)
  const [createdByProfile, setCreatedByProfile] = useState<ProfileInfo | null>(null)
  const [updatedByProfile, setUpdatedByProfile] = useState<ProfileInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null)
  const [ledgerHistory, setLedgerHistory] = useState<any[]>([])
  const [hotelOrgId, setHotelOrgId] = useState<string>('')

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

      // Get hotel tenant id (city_ledger_accounts + transactions are scoped by this)
      let tenantId = ''
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single()
        if (profileRow?.organization_id) {
          tenantId = profileRow.organization_id
          setHotelOrgId(profileRow.organization_id)
        }
      }
      if (!tenantId && authTenantOrgId) tenantId = authTenantOrgId

      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, org_type, email, phone, contact_person, address, current_balance, created_at, created_by, updated_at, updated_by')
        .eq('id', orgId)
        .single()

      if (error) throw error

      const balanceMap = await calculateOrganizationBalancesBatch(supabase, [orgId], {
        ...(tenantId ? { hotelTenantId: tenantId } : {}),
      })
      const mergedBalance = Number(balanceMap[orgId] ?? data.current_balance ?? 0)

      setOrganization({ ...data, current_balance: mergedBalance })
      setFormData({
        name: data.name,
        org_type: data.org_type,
        email: data.email || '',
        phone: data.phone || '',
        contact_person: data.contact_person || '',
        address: data.address || '',
      })

      // city_ledger_accounts.organization_id is the hotel tenant; link by account_name + tenant
      if (tenantId) {
        const { data: ledgerRows } = await supabase
          .from('city_ledger_accounts')
          .select('id, balance, account_name, account_type')
          .eq('organization_id', tenantId)
          .ilike('account_name', data.name.trim())
          .in('account_type', ['organization', 'corporate'])
          .order('balance', { ascending: false })

        const ledgerPick =
          ledgerRows && ledgerRows.length
            ? ledgerRows.reduce((best: any, row: any) =>
                Number(row.balance || 0) > Number(best.balance || 0) ? row : best
              )
            : null
        setLedgerAccountId(ledgerPick?.id ?? null)
      } else {
        setLedgerAccountId(null)
      }

      // Fetch ledger transaction history
      if (data.name && tenantId) {
        const { data: txData } = await supabase
          .from('transactions')
          .select('id, transaction_id, amount, payment_method, status, description, created_at')
          .eq('organization_id', tenantId)
          .ilike('guest_name', data.name.trim())
          .order('created_at', { ascending: false })
          .limit(20)
        setLedgerHistory(txData || [])
      } else {
        setLedgerHistory([])
      }

      const profileIds = [data.created_by, data.updated_by].filter(Boolean)
      const profileMap = await fetchUserDisplayNameMap(profileIds, userId)

      // Fetch creator profile
      if (data.created_by) {
        setCreatedByProfile({ id: data.created_by, full_name: profileMap[data.created_by] })
      }
      // Fetch updater profile
      if (data.updated_by) {
        setUpdatedByProfile({ id: data.updated_by, full_name: profileMap[data.updated_by] })
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

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      const { data: result, error } = await supabase
        .from('organizations')
        .update({
          name: formData.name,
          org_type: formData.org_type,
          email: formData.email || null,
          phone: formData.phone || null,
          contact_person: formData.contact_person || null,
          address: formData.address || null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq('id', orgId)
        .select()

      if (error) {
        throw error
      }

      toast.success('Organization updated successfully')
      setIsEditing(false)
      await fetchOrganization()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update organization')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!organization) return

    toast.custom(
      (t: string | number) => (
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
      { duration: Infinity }
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
        {isSuperadmin && <div className="flex gap-2">
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
        </div>}
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
          <Card className={`border-2 ${
            organization.current_balance > 0
              ? 'border-red-200 bg-red-50/30'
              : organization.current_balance < 0
                ? 'border-red-200 bg-red-50/30'
                : 'border-border'
          }`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">City Ledger</CardTitle>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    organization.current_balance > 0
                      ? 'border-red-200 text-red-700 bg-red-50'
                      : organization.current_balance < 0
                        ? 'border-red-200 text-red-700 bg-red-50'
                        : ''
                  }`}
                >
                  {organization.current_balance > 0 ? 'Debit' : organization.current_balance < 0 ? 'Credit' : 'Settled'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className={`text-3xl font-bold ${
                  organization.current_balance !== 0 ? 'text-red-600' : 'text-muted-foreground'
                }`}>
                  {formatNaira(Math.abs(organization.current_balance))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {organization.current_balance > 0
                    ? 'Amount owed to hotel (debit)'
                    : organization.current_balance < 0
                    ? 'Credit in favour of account'
                    : 'Account fully settled'}
                </p>
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={() => setPaymentModalOpen(true)}
              >
                Settle / Top Up Account
              </Button>
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
                    {getUserDisplayName(createdByProfile, organization.created_by)}
                  </p>
                </div>
              )}

              {organization.updated_at && organization.updated_at !== organization.created_at && (
                <>
                  <div className="pt-4 border-t">
                    <p className="text-muted-foreground">Last Updated On</p>
                    <p className="font-medium">
                      {format(new Date(organization.updated_at), 'MMM dd, yyyy')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(organization.updated_at), 'hh:mm a')}
                    </p>
                  </div>

                  {updatedByProfile && (
                    <div>
                      <p className="text-muted-foreground">Last Updated By</p>
                      <p className="font-medium">
                        {getUserDisplayName(updatedByProfile, organization.updated_by)}
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* City Ledger Transaction History */}
      {ledgerHistory.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">City Ledger Transaction History</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ledgerHistory.map((tx: any) => (
                <div key={tx.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  {tx.description?.toLowerCase().includes('top-up') || tx.description?.toLowerCase().includes('credit')
                    ? <ArrowUpCircle className="h-4 w-4 text-blue-500 shrink-0" />
                    : tx.description?.toLowerCase().includes('settlement') || tx.description?.toLowerCase().includes('payment')
                    ? <ArrowDownCircle className="h-4 w-4 text-green-500 shrink-0" />
                    : <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{tx.description || tx.transaction_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), 'dd MMM yyyy, hh:mm a')}
                      {' · '}
                      <span className="capitalize">{tx.payment_method?.replace('_', ' ')}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold ${tx.description?.toLowerCase().includes('settlement') ? 'text-green-600' : 'text-blue-600'}`}>
                      {formatNaira(tx.amount)}
                    </p>
                    <Badge variant="outline" className="text-xs mt-0.5">{tx.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* City Ledger Payment Modal */}
      <CityLedgerPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSuccess={fetchOrganization}
        accountType="organization"
        accountName={organization.name}
        ledgerAccountId={ledgerAccountId}
        currentBalance={organization.current_balance}
        organizationId={(hotelOrgId || authTenantOrgId) ?? ''}
        orgId={orgId}
      />
    </div>
  )
}
