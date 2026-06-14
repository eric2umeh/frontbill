import type { User } from '@supabase/supabase-js'

export type PasswordLoginSession = {
  access_token: string
  refresh_token: string
  expires_in?: number
  expires_at?: number
  token_type?: string
  user: User
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  token_type?: string
  user?: User
  msg?: string
  error_description?: string
}

/** Server-side email/password auth against Supabase (no browser round-trip). */
export async function performPasswordLogin(
  email: string,
  password: string,
): Promise<{ session: PasswordLoginSession } | { error: string; status: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { error: 'Supabase not configured', status: 503 }
  }

  const trimmedEmail = email.trim()
  if (!trimmedEmail || !password) {
    return { error: 'Email and password are required', status: 400 }
  }

  let tokenRes: Response
  try {
    tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: trimmedEmail, password }),
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    return {
      error:
        'Cannot reach Supabase. Open your Supabase dashboard and restart the project, then try again.',
      status: 503,
    }
  }

  const data = (await tokenRes.json()) as TokenResponse

  if (!tokenRes.ok || !data.access_token || !data.refresh_token || !data.user?.id) {
    return {
      error: data.msg || data.error_description || 'Invalid email or password',
      status: 401,
    }
  }

  return {
    session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at,
      token_type: data.token_type,
      user: data.user,
    },
  }
}
