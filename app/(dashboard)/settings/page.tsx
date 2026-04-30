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
import { Loader2, Building2, Shield, Eye, EyeOff, Clock } from 'lucide-react'
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Checkout policy
  const [checkoutTime, setCheckoutTime] = useState('12:00')
  const [lateCheckoutFeePerHour, setLateCheckoutFeePerHour] = useState('')
  const [checkoutPolicySaving, setCheckoutPolicySaving] = useState(false)
  const isAdmin = role === 'admin'

  useEffect(() => {
    async function fetchHotelInfo() {
      if (!organizationId || !supabase) return
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('name, email, address, phone, checkout_time, late_checkout_fee_per_hour')
          .eq('id', organizationId)
          .maybeSingle()

        if (error) throw error
        if (data) {
          setHotelName(data.name || '')
          setHotelEmail(data.email || '')
          setHotelAddress(data.address || '')
          setHotelPhone(data.phone || '')
          setCheckoutTime(data.checkout_time || '12:00')
          setLateCheckoutFeePerHour(data.late_checkout_fee_per_hour?.toString() || '')
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to load hotel information')
      } finally {
        setHotelLoading(false)
      }
    }
    fetchHotelInfo()
  }, [organizationId])

  async function handleUpdatePassword() {
    if (!currentPassword) {
      toast.error('Please enter your current password')
      return
    }
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
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (verifyError) throw new Error('Current password is incorrect')

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

  async function handleSaveCheckoutPolicy() {
    if (!organizationId || !isAdmin) return
    setCheckoutPolicySaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          checkout_time: checkoutTime,
          late_checkout_fee_per_hour: lateCheckoutFeePerHour ? parseFloat(lateCheckoutFeePerHour) : null,
        })
        .eq('id', organizationId)
      if (error) throw error
      toast.success('Checkout policy saved successfully')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save checkout policy')
    } finally {
      setCheckoutPolicySaving(false)
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

      {/* Hotel Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <CardTitle>Hotel Information</CardTitle>
            <Badge variant="outline" className="ml-auto">View Only</Badge>
          </div>
          <CardDescription>
            Hotel details are view-only here.
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
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel_email">Email</Label>
                  <Input
                    id="hotel_email"
                    type="email"
                    placeholder="info@hotel.com"
                    value={hotelEmail}
                    disabled
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotel_address">Address</Label>
                <Input
                  id="hotel_address"
                  placeholder="123 Main Street, Lagos"
                  value={hotelAddress}
                  disabled
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotel_phone">Phone</Label>
                  <Input
                    id="hotel_phone"
                    placeholder="+234 800 000 0000"
                    value={hotelPhone}
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" value="Nigerian Naira (₦)" disabled />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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

      {/* Checkout Policy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>Checkout Policy</CardTitle>
            {!isAdmin && <Badge variant="outline" className="ml-auto">View Only</Badge>}
          </div>
          <CardDescription>
            Set the standard checkout time and the late checkout fee charged per extra hour. Auto-checkout runs at 2:00 PM for all overdue bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="checkout_time">Standard Checkout Time</Label>
              <Input
                id="checkout_time"
                type="time"
                value={checkoutTime}
                onChange={(e) => setCheckoutTime(e.target.value)}
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Guests are expected to check out by this time. Auto-checkout enforces departure by 2:00 PM.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="late_checkout_fee">Late Checkout Fee (per hour, ₦)</Label>
              <Input
                id="late_checkout_fee"
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={lateCheckoutFeePerHour}
                onChange={(e) => setLateCheckoutFeePerHour(e.target.value)}
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Charge per extra hour past the standard checkout time. Use &quot;Add Charge&quot; on the booking to apply it.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
            <p className="font-medium">How late checkout works</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Standard checkout time: <strong>{checkoutTime}</strong></li>
              <li>Grace window: up to <strong>2:00 PM</strong> without auto-checkout</li>
              <li>Any extension past {checkoutTime} requires an &quot;Add Charge&quot; entry on the booking for <strong>₦{lateCheckoutFeePerHour || '—'}/hr</strong></li>
              <li>At 2:00 PM the system automatically checks out any remaining active bookings</li>
            </ul>
          </div>
          {isAdmin && (
            <Button onClick={handleSaveCheckoutPolicy} disabled={checkoutPolicySaving}>
              {checkoutPolicySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Policy
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
