import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey } from '@/lib/permissions'

export type SuperadminOrgGate =
  | { error: NextResponse }
  | { admin: ReturnType<typeof createAdminClient>; userId: string; organizationId: string }

export async function requireSuperadminOrg(request: Request): Promise<SuperadminOrgGate> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Server is missing Supabase service credentials.' },
        { status: 503 },
      ),
    }
  }

  const cookieSb = await createClient()
  const {
    data: { user: cookieUser },
  } = await cookieSb.auth.getUser()

  let userId: string | null = cookieUser?.id ?? null
  if (!userId) {
    const raw = request.headers.get('authorization')?.trim()
    const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
    if (!bearer) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    const { data: jwtUserData, error: jwtError } = await admin.auth.getUser(bearer)
    if (jwtError || !jwtUserData.user?.id) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    userId = jwtUserData.user.id
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) }
  }

  if (canonicalRoleKey(profile.role) !== 'superadmin') {
    return {
      error: NextResponse.json(
        { error: 'Only a Superadmin may access operational reports.' },
        { status: 403 },
      ),
    }
  }

  return {
    admin,
    userId,
    organizationId: profile.organization_id as string,
  }
}

export type AuthenticatedOrgGate =
  | { error: NextResponse }
  | {
      admin: ReturnType<typeof createAdminClient>
      userId: string
      organizationId: string
      role: string
    }

export async function requireAuthenticatedOrg(
  request: Request,
  callerIdFromBody?: string | null,
): Promise<AuthenticatedOrgGate> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      error: NextResponse.json({ error: 'Server unavailable' }, { status: 503 }),
    }
  }

  const callerId = callerIdFromBody?.trim()
  if (!callerId) {
    return { error: NextResponse.json({ error: 'caller_id is required' }, { status: 400 }) }
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', callerId)
    .maybeSingle()

  if (profileError || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) }
  }

  return {
    admin,
    userId: callerId,
    organizationId: profile.organization_id as string,
    role: String(profile.role || ''),
  }
}
