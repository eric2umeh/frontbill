'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Hotel, Loader2 } from 'lucide-react'
import { isPublicSignupEnabledClient } from '@/lib/auth/public-signup'

export default function SignUpPage() {
  const router = useRouter()
  const signupEnabled = isPublicSignupEnabledClient()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!signupEnabled) {
      router.replace('/auth/login')
    }
  }, [router, signupEnabled])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const fail = (message: string) => {
      setError(message)
      toast.error(message)
    }

    if (!firstName.trim() || !lastName.trim()) {
      fail('First and last name are required')
      return
    }
    if (!hotelName.trim()) {
      fail('Hotel name is required')
      return
    }
    if (!email.trim()) {
      fail('Email is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fail('Please enter a valid email address')
      return
    }
    if (password.length < 6) {
      fail('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const signupRes = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          hotelName: hotelName.trim(),
          email: email.trim(),
          password,
        }),
      })

      const signupBody = (await signupRes.json().catch(() => ({}))) as {
        error?: string
        ok?: boolean
      }

      if (!signupRes.ok) {
        throw new Error(signupBody.error || 'Failed to create account')
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const loginBody = (await loginRes.json().catch(() => ({}))) as { error?: string }

      if (!loginRes.ok) {
        toast.success('Account created. Please sign in with your email and password.')
        router.push('/auth/login')
        return
      }

      toast.success('Welcome! Your hotel account is ready.')
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  if (!signupEnabled) {
    return null
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Hotel className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
            <CardDescription className="mt-2">
              Register your hotel on FrontBill — you become the administrator
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  disabled={loading}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  disabled={loading}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotelName">Hotel name *</Label>
              <Input
                id="hotelName"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                placeholder="Your Hotel Name"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hotel.com"
                disabled={loading}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
