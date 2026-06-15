'use server'

import { LOGIN_SUCCESS_COOKIE } from '@/lib/auth/constants'
import { performPasswordLogin } from '@/lib/supabase/perform-password-login'
import { persistSessionOnCookieStore } from '@/lib/supabase/persist-session-cookies'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export type LoginFormState = {
  error?: string
  email?: string
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const result = await performPasswordLogin(email, password)
  if ('error' in result) {
    return { error: result.error, email }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return { error: 'Supabase not configured', email }
  }

  try {
    await persistSessionOnCookieStore(supabaseUrl, result.session)

    const cookieStore = await cookies()
    cookieStore.set(LOGIN_SUCCESS_COOKIE, '1', {
      path: '/',
      maxAge: 120,
      sameSite: 'lax',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not save session'
    return { error: `Login succeeded but session could not be saved: ${msg}`, email }
  }

  redirect('/dashboard')
}
