'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Hotel } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const seedDemoUsers = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/setup/seed-users', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success('Demo accounts created! Use the credentials below.')
        console.log('[v0] Demo users:', data.credentials)
      } else {
        toast.error(data.error || 'Failed to seed users')
      }
    } catch (error: any) {
      toast.error('Error creating demo accounts')
    } finally {
      setSeeding(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    console.log('[v0] Login attempt started', { email })

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      console.log('[v0] Login response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }

      console.log('[v0] Login successful, redirecting...')
      toast.success('Login successful!')
      router.push('/dashboard')
      router.refresh()
    } catch (error: any) {
      console.error('[v0] Login failed:', error)
      toast.error(error.message || 'Failed to login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Hotel className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">FrontBill</CardTitle>
            <CardDescription className="mt-2">
              Hotel Financial Accountability System
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@hotel.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-4 space-y-2 text-center text-sm">
            <p className="font-semibold text-foreground mb-2">First Time Setup?</p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={seedDemoUsers}
              disabled={seeding}
            >
              {seeding ? 'Creating Demo Accounts...' : '✓ Create Demo Accounts'}
            </Button>
            <div className="mt-3 p-3 bg-muted rounded text-xs space-y-1">
              <p className="font-semibold">Demo Credentials:</p>
              <p>📧 <code className="bg-background px-1 py-0.5 rounded">admin@frontbill.com</code></p>
              <p>🔐 <code className="bg-background px-1 py-0.5 rounded">Admin@123456</code></p>
              <p>or</p>
              <p>📧 <code className="bg-background px-1 py-0.5 rounded">frontdesk@frontbill.com</code></p>
              <p>🔐 <code className="bg-background px-1 py-0.5 rounded">Desk@123456</code></p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-center text-sm text-muted-foreground">
            <p>
              Don't have an account?{' '}
              <Link href="/auth/sign-up" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
