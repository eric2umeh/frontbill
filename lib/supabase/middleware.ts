import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getVerifiedServerUser } from '@/lib/supabase/server-auth'
import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
} from '@/lib/auth/request-auth-headers'

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
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

  const { user } = await getVerifiedServerUser(supabase)

  const requestHeaders = new Headers(request.headers)
  if (user?.id) {
    requestHeaders.set(AUTH_USER_ID_HEADER, user.id)
    requestHeaders.set(AUTH_USER_EMAIL_HEADER, user.email ?? '')
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const copySessionCookies = (target: NextResponse) => {
    for (const cookie of supabaseResponse.cookies.getAll()) {
      target.cookies.set(cookie.name, cookie.value, cookie)
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
  ]
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  )

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return copySessionCookies(NextResponse.redirect(url))
  }

  if (user && request.nextUrl.pathname.startsWith('/auth/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return copySessionCookies(NextResponse.redirect(url))
  }

  if (request.nextUrl.pathname === '/' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return copySessionCookies(NextResponse.redirect(url))
  }

  return response
}
