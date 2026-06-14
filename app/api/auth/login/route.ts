import { LOGIN_SUCCESS_COOKIE } from '@/lib/auth/constants'
import { performPasswordLogin } from '@/lib/supabase/perform-password-login'
import { persistSessionOnResponse } from '@/lib/supabase/persist-session-cookies'
import { NextRequest, NextResponse } from 'next/server'

/** Email/password login via server — browser never calls Supabase directly. */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    let email = ''
    let password = ''
    let wantsRedirect = false

    if (
      contentType.includes('multipart/form-data') ||
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      const form = await request.formData()
      email = String(form.get('email') ?? '').trim()
      password = String(form.get('password') ?? '')
      wantsRedirect = true
    } else {
      const body = await request.json()
      email = String(body?.email ?? '').trim()
      password = String(body?.password ?? '')
    }

    const result = await performPasswordLogin(email, password)
    if ('error' in result) {
      if (wantsRedirect) {
        const url = new URL('/auth/login', request.url)
        url.searchParams.set('error', result.error)
        return NextResponse.redirect(url)
      }
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const response = wantsRedirect
      ? NextResponse.redirect(new URL('/dashboard', request.url))
      : NextResponse.json({ ok: true })

    persistSessionOnResponse(response, supabaseUrl, result.session)

    response.cookies.set(LOGIN_SUCCESS_COOKIE, '1', {
      path: '/',
      maxAge: 120,
      sameSite: 'lax',
    })

    return response
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
