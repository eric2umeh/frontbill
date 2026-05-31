import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  APP_LOGIN_ROLE_KEYS,
  canonicalRoleKey,
  type RoleKey,
} from '@/lib/permissions'
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

type ProfileRow = {
  full_name: string | null
  role: string | null
  organization_id: string | null
}

const PROFILE_FETCH_MS = 10_000

function isAllowedLoginRole(roleKey: RoleKey | null): roleKey is RoleKey {
  return roleKey != null && APP_LOGIN_ROLE_KEYS.includes(roleKey)
}

function resolveLoginRole(...candidates: Array<string | null | undefined>): RoleKey | null {
  for (const candidate of candidates) {
    const roleKey = canonicalRoleKey(candidate)
    if (isAllowedLoginRole(roleKey)) return roleKey
  }
  return null
}

async function fetchProfileWithTimeout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const query = supabase
    .from('profiles')
    .select('full_name, role, organization_id')
    .eq('id', userId)
    .maybeSingle()

  return Promise.race([
    query,
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: { message: 'Profile fetch timed out' } }),
        PROFILE_FETCH_MS,
      ),
    ),
  ])
}

async function fetchProfileById(userId: string): Promise<{
  profile: ProfileRow | null
  profileError: { message: string } | null
  metadataRole: string | null
}> {
  let metadataRole: string | null = null

  try {
    const admin = createAdminClient()
    const [profileResult, authResult] = await Promise.all([
      admin
        .from('profiles')
        .select('full_name, role, organization_id')
        .eq('id', userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ])

    const meta = authResult.data.user?.user_metadata?.role
    metadataRole =
      typeof meta === 'string' && meta.trim() ? meta.trim() : null

    if (!profileResult.error && profileResult.data) {
      return {
        profile: profileResult.data,
        profileError: null,
        metadataRole,
      }
    }

    if (profileResult.error) {
      console.warn('loadDashboardUser: admin profile fetch failed', profileResult.error.message)
    }
  } catch (error) {
    console.warn(
      'loadDashboardUser: admin client unavailable, falling back to session client',
      error instanceof Error ? error.message : error,
    )
  }

  const supabase = await createClient()
  const { data: profile, error: profileError } = await fetchProfileWithTimeout(
    supabase,
    userId,
  )

  return {
    profile: profile ?? null,
    profileError: profileError ?? null,
    metadataRole,
  }
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

    const { profile, profileError, metadataRole } = await fetchProfileById(userId)

    if (profileError) {
      console.warn('loadDashboardUser: profile fetch failed', profileError.message)
    }

    const roleKey = resolveLoginRole(profile?.role, metadataRole)

    if (profile) {
      if (!roleKey) {
        console.warn('loadDashboardUser: forbidden — unrecognized role', {
          userId,
          email,
          profileRole: profile.role,
          metadataRole,
        })
        return { status: 'forbidden' }
      }

      return {
        status: 'ok',
        user: {
          id: userId,
          email,
          name: profile.full_name || email.split('@')[0] || 'User',
          role: roleKey,
          organizationId: profile.organization_id || '',
          organizationLogoUrl: '',
        },
      }
    }

    if (roleKey) {
      return {
        status: 'ok',
        user: {
          id: userId,
          email,
          name: email.split('@')[0] || 'User',
          role: roleKey,
          organizationId: '',
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
