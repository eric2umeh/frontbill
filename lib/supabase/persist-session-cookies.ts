import {
  createChunks,
  DEFAULT_COOKIE_OPTIONS,
  stringToBase64URL,
} from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'

const BASE64_PREFIX = 'base64-'

export function getSupabaseAuthCookieName(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

type SessionCookiePayload = {
  access_token: string
  refresh_token: string
  expires_in?: number
  expires_at?: number
  token_type?: string
  user: User
}

function encodeSessionCookieChunks(supabaseUrl: string, session: SessionCookiePayload) {
  const cookieName = getSupabaseAuthCookieName(supabaseUrl)
  const storageValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type ?? 'bearer',
    user: session.user,
  })
  const encoded = BASE64_PREFIX + stringToBase64URL(storageValue)
  return createChunks(cookieName, encoded)
}

/** Write Supabase SSR auth cookies without calling Auth API (avoids hangs on unhealthy projects). */
export function persistSessionOnResponse(
  response: NextResponse,
  supabaseUrl: string,
  session: SessionCookiePayload,
) {
  for (const { name, value } of encodeSessionCookieChunks(supabaseUrl, session)) {
    response.cookies.set(name, value, {
      ...DEFAULT_COOKIE_OPTIONS,
      path: '/',
    })
  }
}

/** Server Actions / Route Handlers using `cookies()` from next/headers. */
export async function persistSessionOnCookieStore(
  supabaseUrl: string,
  session: SessionCookiePayload,
) {
  const cookieStore = await cookies()
  for (const { name, value } of encodeSessionCookieChunks(supabaseUrl, session)) {
    cookieStore.set(name, value, {
      ...DEFAULT_COOKIE_OPTIONS,
      path: '/',
    })
  }
}
