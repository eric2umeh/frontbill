import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromCookies } from '@/lib/supabase/auth-from-cookies'
import { getVerifiedServerUser } from '@/lib/supabase/server-auth'
import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
} from '@/lib/auth/request-auth-headers'

/** Paths that must render immediately — no Supabase Auth server round-trip. */
function isPublicAuthPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/setup/') ||
    pathname === '/access-denied'
  )
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request })
  }

  const pathname = request.nextUrl.pathname

  // Login/sign-up must not block on getUser (stale Docker cookies caused 12s+ hangs).
  if (isPublicAuthPath(pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const cookieUser = getAuthUserFromCookies(request.cookies.getAll())

  // Prefer cookie JWT (instant). Only hit Supabase Auth when there is no valid cookie.
  let effectiveUser: { id: string; email?: string | null } | null = cookieUser

  if (!cookieUser) {
    const verified = await getVerifiedServerUser(supabase)
    effectiveUser = verified.user
  }

  const requestHeaders = new Headers(request.headers)
  if (effectiveUser?.id) {
    requestHeaders.set(AUTH_USER_ID_HEADER, effectiveUser.id)
    requestHeaders.set(AUTH_USER_EMAIL_HEADER, effectiveUser.email ?? '')
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const copySessionCookies = (target: NextResponse) => {
    for (const cookie of supabaseResponse.cookies.getAll()) {
      target.cookies.set(cookie.name, cookie.value, cookie)
    }
    // Never clear cookies on Auth API timeouts — that logs users out after a slow login.
    return target
  }

  copySessionCookies(response)

  const protectedPaths = [
    '/dashboard',
    '/guests',
    '/guest-database',
    '/accounts',
    '/rooms',
    '/bookings',
    '/bulk-bookings',
    '/reservations',
    '/transactions',
    '/payments',
    '/ledger',
    '/organizations',
    '/analytics',
    '/reconciliation',
    '/settings',
    '/reports',
    '/documents',
    '/expenses',
    '/night-audit',
    '/housekeeping',
    '/maintenance',
    '/users-roles',
    '/store',
    '/outlets',
    '/supply',
    '/refunds',
  ]
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  )

  if (isProtected && !effectiveUser) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set(
      'error',
      'Your session expired or could not be read. Please sign in again.',
    )
    return copySessionCookies(NextResponse.redirect(url))
  }

  if (pathname === '/' && effectiveUser) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return copySessionCookies(NextResponse.redirect(url))
  }

  return response
}
