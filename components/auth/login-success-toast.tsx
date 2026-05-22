'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { LOGIN_SUCCESS_COOKIE, LOGIN_SUCCESS_TOAST_KEY } from '@/lib/auth/constants'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

function shouldShowLoginToast(): boolean {
  if (readCookie(LOGIN_SUCCESS_COOKIE) === '1') return true
  try {
    return sessionStorage.getItem(LOGIN_SUCCESS_TOAST_KEY) === '1'
  } catch {
    return false
  }
}

function clearLoginToastSignals() {
  clearCookie(LOGIN_SUCCESS_COOKIE)
  try {
    sessionStorage.removeItem(LOGIN_SUCCESS_TOAST_KEY)
  } catch {
    /* ignore */
  }
}

/** Shows "Login successful!" once after sign-in (cookie survives full-page redirect). */
export function LoginSuccessToast() {
  useEffect(() => {
    if (!shouldShowLoginToast()) return

    const timer = window.setTimeout(() => {
      if (!shouldShowLoginToast()) return
      clearLoginToastSignals()
      toast.success('Login successful!', { id: 'login-success' })
    }, 200)

    return () => window.clearTimeout(timer)
  }, [])

  return null
}
