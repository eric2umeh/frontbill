import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { APP_LOGIN_ROLE_KEYS, canonicalRoleKey } from '@/lib/permissions'
import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
} from '@/lib/auth/request-auth-headers'

export type DashboardUserPayload = {
  id: string
  email: string
  name: string
  role: string
  organizationId: string
  organizationLogoUrl: string
}

export type LoadDashboardUserResult =
  | { status: 'ok'; user: DashboardUserPayload }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }

const PROFILE_FETCH_MS = 10_000

async function fetchProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const query = supabase
    .from('profiles')
    .select('full_name, role, organization_id')
    .eq('id', userId)
    .maybeSingle()

  const raced = await Promise.race([
    query,
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: { message: 'Profile fetch timed out' } }),
        PROFILE_FETCH_MS,
      ),
    ),
  ])

  return raced
}

export async function loadDashboardUser(): Promise<LoadDashboardUserResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return { status: 'unauthenticated' }
  }

  try {
    const hdrs = await headers()
    const userId = hdrs.get(AUTH_USER_ID_HEADER)
    const email = hdrs.get(AUTH_USER_EMAIL_HEADER) || ''

    if (!userId) {
      return { status: 'unauthenticated' }
    }

    const supabase = await createClient()
    const { data: profile, error: profileError } = await fetchProfile(supabase, userId)

    if (profileError) {
      console.warn('loadDashboardUser: profile fetch failed', profileError.message)
    }

    if (!profileError && profile) {
      const rk = canonicalRoleKey(profile.role)
      if (!rk || !APP_LOGIN_ROLE_KEYS.includes(rk)) {
        return { status: 'forbidden' }
      }

      return {
        status: 'ok',
        user: {
          id: userId,
          email,
          name: profile.full_name || email.split('@')[0] || 'User',
          role: rk,
          organizationId: profile.organization_id || '',
          organizationLogoUrl: '',
        },
      }
    }

    return {
      status: 'ok',
      user: {
        id: userId,
        email,
        name: email.split('@')[0] || 'User',
        role: 'admin',
        organizationId: '',
        organizationLogoUrl: '',
      },
    }
  } catch (error) {
    console.error('loadDashboardUser failed:', error)
    return { status: 'unauthenticated' }
  }
}
