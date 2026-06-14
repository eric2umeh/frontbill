'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, LogOut, Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BRAND_LOGO_SESSION_KEY } from '@/lib/branding/constants'
import { APP_LOGIN_ROLE_KEYS, canonicalRoleKey } from '@/lib/permissions'

export default function AccessDeniedPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [resolvedRole, setResolvedRole] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setUserEmail(user.email ?? null)
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
          const rawRole =
            profile?.role ||
            (typeof user.user_metadata?.role === 'string'
              ? user.user_metadata.role
              : null) ||
            'unknown'
          setUserRole(rawRole)
          setResolvedRole(canonicalRoleKey(rawRole) ?? 'unrecognized')
        }
      } catch (error) {
        console.error('Error fetching user role:', error)
      }
    }
    fetchUserRole()
  }, [])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      try {
        sessionStorage.removeItem(BRAND_LOGO_SESSION_KEY)
      } catch {
        /* ignore */
      }
      router.push('/auth/login')
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription>
            You do not have permission to access the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground space-y-1">
            {userEmail ? (
              <p>
                Signed in as <span className="text-foreground">{userEmail}</span>
              </p>
            ) : null}
            <p className="font-medium">
              Profile role:{' '}
              <span className="capitalize text-foreground">
                {userRole?.replaceAll('_', ' ') || 'Loading...'}
              </span>
            </p>
            {resolvedRole ? (
              <p className="text-xs">
                App recognizes this as:{' '}
                <span className="text-foreground">{resolvedRole.replaceAll('_', ' ')}</span>
              </p>
            ) : null}
            <p className="text-xs">
              Allowed roles include Superadmin, Administrator, Manager, Front Desk, Store, Cashier, and other staff roles configured in Users &amp; Roles.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="flex-1"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="flex-1"
            >
              <Home className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground pt-2">
            Please contact your administrator if you believe this is an error.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
