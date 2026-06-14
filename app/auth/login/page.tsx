'use client'

import { useActionState, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Hotel, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BRAND_LOGO_SESSION_KEY } from '@/lib/branding/constants'
import { LoginPendingOverlay, LoginSubmitButton } from '@/components/auth/login-form-fields'
import { loginAction, type LoginFormState } from './actions'

const initialState: LoginFormState = {}

export default function Page() {
  const [state, formAction] = useActionState(loginAction, initialState)
  const [showPassword, setShowPassword] = useState(false)
  const [isConfigured, setIsConfigured] = useState(true)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [sessionBrandLogo, setSessionBrandLogo] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const u = sessionStorage.getItem(BRAND_LOGO_SESSION_KEY)
      if (u && /^https?:\/\//i.test(u)) setSessionBrandLogo(u)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      setIsConfigured(false)
    }
  }, [])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const err = params.get('error')
      if (err) {
        setUrlError(decodeURIComponent(err))
        window.history.replaceState({}, '', '/auth/login')
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      toast.error('Please enter your email address')
      return
    }
    setResetLoading(true)
    try {
      const supabase = createClient()
      if (!supabase) {
        toast.error('Supabase not configured')
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) throw error

      toast.success('Password reset email sent! Check your inbox.')
      setShowForgotPassword(false)
      setResetEmail('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to send reset email'
      toast.error(message)
    } finally {
      setResetLoading(false)
    }
  }

  const displayError = urlError || state.error

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary overflow-hidden">
                {sessionBrandLogo ? (
                  <img src={sessionBrandLogo} alt="" className="h-full w-full object-contain p-1.5 bg-white" />
                ) : (
                  <Hotel className="h-6 w-6 text-primary-foreground" />
                )}
              </div>
              <div className="text-center">
                <CardTitle className="text-2xl">FrontBill</CardTitle>
                <CardDescription>
                  Hotel Financial Accountability System
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {!isConfigured && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700">
                    <p className="font-semibold mb-1">Setup Required</p>
                    <p className="mb-3">Environment variables not configured.</p>
                    <Link href="/auth/setup" className="underline font-semibold hover:underline-offset-2">
                      Go to Setup Guide
                    </Link>
                  </div>
                </div>
              )}

              {displayError && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {displayError}
                </div>
              )}

              {/* Server Action login — works even when client fetch fails */}
              <form action={formAction}>
                <LoginPendingOverlay />
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@frontbill.com"
                      required
                      disabled={!isConfigured}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        disabled={!isConfigured}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <LoginSubmitButton disabled={!isConfigured} />
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="your@email.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForgotPassword(false)}>
                Cancel
              </Button>
              <Button onClick={handleForgotPassword} disabled={resetLoading}>
                {resetLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
