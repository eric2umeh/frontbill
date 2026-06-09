import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getVerifiedServerUser } from '@/lib/supabase/server-auth'
import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
} from '@/lib/auth/request-auth-headers'

/** Paths that must render immediately — no Supabase Auth server round-trip. */
function isPublicAuthPath(pathname: string) {
  return (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/setup/')
  )
}

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
      response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
    }
  }
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

  const { user, timedOut } = await getVerifiedServerUser(supabase)

  let effectiveUser = timedOut ? null : user

  // Slow Auth API must not log users out — fall back to the session cookie.
  if (!effectiveUser && timedOut) {
    const { data: { session } } = await supabase.auth.getSession()
    effectiveUser = session?.user ?? null
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
    // Only clear cookies when there is no valid session (not on transient timeouts).
    if (timedOut && !effectiveUser) {
      clearSupabaseAuthCookies(request, target)
    }
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
    return copySessionCookies(NextResponse.redirect(url))
  }

  if (pathname === '/' && effectiveUser) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return copySessionCookies(NextResponse.redirect(url))
  }

  return response
}
