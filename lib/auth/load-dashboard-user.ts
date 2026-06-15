import { cookies, headers } from 'next/headers'
import { getAuthUserFromCookies } from '@/lib/supabase/auth-from-cookies'
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

export type ProfileRow = {
  full_name: string | null
  role: string | null
  organization_id: string | null
}

const PROFILE_FETCH_MS = 2_500
const ADMIN_PROFILE_FETCH_MS = 2_500

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

  // Prefer session cookies (fast). Admin/service-role calls can hang when Supabase is unhealthy.
  try {
    const supabase = await createClient()
    const { data: profile, error: profileError } = await fetchProfileWithTimeout(
      supabase,
      userId,
    )
    if (profile && !profileError) {
      return { profile, profileError: null, metadataRole }
    }
    if (profileError) {
      console.warn('loadDashboardUser: session profile fetch failed', profileError.message)
    }
  } catch (error) {
    console.warn(
      'loadDashboardUser: session client profile fetch error',
      error instanceof Error ? error.message : error,
    )
  }

  try {
    const adminResult = await Promise.race([
      (async () => {
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
        const roleFromMeta =
          typeof meta === 'string' && meta.trim() ? meta.trim() : null

        if (!profileResult.error && profileResult.data) {
          return {
            profile: profileResult.data,
            profileError: null as { message: string } | null,
            metadataRole: roleFromMeta,
          }
        }

        if (profileResult.error) {
          console.warn(
            'loadDashboardUser: admin profile fetch failed',
            profileResult.error.message,
          )
        }

        return null
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ADMIN_PROFILE_FETCH_MS)),
    ])

    if (adminResult) return adminResult
  } catch (error) {
    console.warn(
      'loadDashboardUser: admin client unavailable',
      error instanceof Error ? error.message : error,
    )
  }

  return {
    profile: null,
    profileError: { message: 'Profile unavailable' },
    metadataRole,
  }
}

export function buildDashboardUserResultFromProfile(params: {
  userId: string
  email: string
  profile: ProfileRow | null
  metadataRole: string | null
}): LoadDashboardUserResult {
  const { userId, email, profile, metadataRole } = params
  const roleKey = resolveLoginRole(profile?.role, metadataRole)

  if (!profile) {
    console.warn('loadDashboardUser: forbidden — profile unavailable', {
      userId,
      email,
      metadataRole,
    })
    return { status: 'forbidden' }
  }

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

export async function loadDashboardUser(): Promise<LoadDashboardUserResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return { status: 'unauthenticated' }
  }

  try {
    const hdrs = await headers()
    let userId = hdrs.get(AUTH_USER_ID_HEADER)
    let email = hdrs.get(AUTH_USER_EMAIL_HEADER) || ''

    if (!userId) {
      const cookieStore = await cookies()
      const fromCookie = getAuthUserFromCookies(cookieStore.getAll())
      if (!fromCookie) {
        return { status: 'unauthenticated' }
      }
      userId = fromCookie.id
      email = fromCookie.email
    }

    const { profile, profileError, metadataRole } = await fetchProfileById(userId)

    if (profileError) {
      console.warn('loadDashboardUser: profile fetch failed', profileError.message)
    }

    return buildDashboardUserResultFromProfile({
      userId,
      email,
      profile,
      metadataRole,
    })
  } catch (error) {
    console.error('loadDashboardUser failed:', error)
    return { status: 'unauthenticated' }
  }
}
