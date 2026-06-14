import { LOGIN_SUCCESS_COOKIE } from '@/lib/auth/constants'
import { persistSessionOnResponse } from '@/lib/supabase/persist-session-cookies'
import { NextRequest, NextResponse } from 'next/server'

/** Persist sign-in tokens into HTTP cookies (SSR format) for server layouts and middleware. */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const access_token = String(body?.access_token || '').trim()
    const refresh_token = String(body?.refresh_token || '').trim()
    const user = body?.user

    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: 'Missing session tokens' }, { status: 400 })
    }

    if (!user?.id) {
      return NextResponse.json({ error: 'Missing user in session payload' }, { status: 400 })
    }

    const response = NextResponse.json({ ok: true })

    persistSessionOnResponse(response, supabaseUrl, {
      access_token,
      refresh_token,
      expires_in: body?.expires_in,
      expires_at: body?.expires_at,
      token_type: body?.token_type,
      user,
    })

    response.cookies.set(LOGIN_SUCCESS_COOKIE, '1', {
      path: '/',
      maxAge: 120,
      sameSite: 'lax',
    })

    return response
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
