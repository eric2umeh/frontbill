'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Building2, Shield, Users, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const router = useRouter()
  const { userId, email, name, role, organizationId } = useAuth()
  const supabase = createClient()

  const [hotelName, setHotelName] = useState('')
  const [hotelEmail, setHotelEmail] = useState('')
  const [hotelAddress, setHotelAddress] = useState('')
  const [hotelPhone, setHotelPhone] = useState('')
  const [hotelLoading, setHotelLoading] = useState(true)
  const [hotelSaving, setHotelSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    async function fetchHotelInfo() {
      if (!organizationId || !supabase) return
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('name, email, address, phone')
          .eq('id', organizationId)
          .maybeSingle()

        if (error) throw error
        if (data) {
          setHotelName(data.name || '')
          setHotelEmail(data.email || '')
          setHotelAddress(data.address || '')
          setHotelPhone(data.phone || '')
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to load hotel information')
      } finally {
        setHotelLoading(false)
      }
    }
    fetchHotelInfo()
  }, [organizationId])

  async function handleSaveHotel() {
    if (!organizationId || !supabase) return
    setHotelSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: hotelName.trim(),
          email: hotelEmail.trim(),
          address: hotelAddress.trim(),
          phone: hotelPhone.trim(),
        })
        .eq('id', organizationId)

      if (error) throw error
      toast.success('Hotel information updated successfully')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update hotel information')
    } finally {
      setHotelSaving(false)
    }
  }

  async function handleUpdatePassword() {
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match')
      return
    }
    if (!supabase) return
    setPasswordSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your profile and hotel information
        </p>
      </div>

      {/* Hotel Information — Admin Only */}
      {role === 'admin' && (
        <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <CardTitle>Hotel Information</CardTitle>
          </div>
          <CardDescription>
            Update your hotel details for documents and reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hotelLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotel_name">Hotel Name</Label>
                  <Input
                    id="hotel_name"
                    placeholder="Grand Hotel"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel_email">Email</Label>
                  <Input
                    id="hotel_email"
                    type="email"
                    placeholder="info@hotel.com"
                    value={hotelEmail}
                    onChange={(e) => setHotelEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotel_address">Address</Label>
                <Input
                  id="hotel_address"
                  placeholder="123 Main Street, Lagos"
                  value={hotelAddress}
                  onChange={(e) => setHotelAddress(e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotel_phone">Phone</Label>
                  <Input
                    id="hotel_phone"
                    placeholder="+234 800 000 0000"
                    value={hotelPhone}
                    onChange={(e) => setHotelPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" value="Nigerian Naira (₦)" disabled />
                </div>
              </div>
              <Separator />
              <Button onClick={handleSaveHotel} disabled={hotelSaving}>
                {hotelSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Profile & Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Profile &amp; Security</CardTitle>
          </div>
          <CardDescription>
            View your profile and manage your password
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Email</Label>
              <p className="text-sm font-medium">{email}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Name</Label>
              <p className="text-sm font-medium">{name || '—'}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Role</Label>
              <Badge variant="secondary">{role}</Badge>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Change Password</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="current_password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current_password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new_password"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={handleUpdatePassword} disabled={passwordSaving || !newPassword || !confirmPassword}>
              {passwordSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
