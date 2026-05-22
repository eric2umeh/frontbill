import { LOGIN_SUCCESS_COOKIE } from '@/lib/auth/constants'
import { createRouteHandlerClient } from '@/lib/supabase/route-handler'
import { NextRequest, NextResponse } from 'next/server'

/** Persist sign-in tokens into HTTP cookies (SSR format) for server layouts and middleware. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const access_token = String(body?.access_token || '').trim()
    const refresh_token = String(body?.refresh_token || '').trim()

    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: 'Missing session tokens' }, { status: 400 })
    }

    const response = NextResponse.json({ ok: true })
    const supabase = createRouteHandlerClient(request, response)

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

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
