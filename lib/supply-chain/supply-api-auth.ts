import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'

export type SupplyAuthed = {
  userId: string
  orgId: string
  role: string
}

function clientOrgIdFromRequest(
  request: Request,
  body?: Record<string, unknown>,
): string | null {
  const fromQuery = new URL(request.url).searchParams.get('organization_id')?.trim()
  if (fromQuery) return fromQuery
  const fromBody =
    typeof body?.organization_id === 'string' ? body.organization_id.trim() : ''
  return fromBody || null
}

async function resolveAuthedUserId(
  request: Request,
  callerId: string,
): Promise<string | null> {
  const raw = request.headers.get('authorization')?.trim()
  const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
  if (bearer) {
    try {
      const admin = createAdminClient()
      const { data, error } = await admin.auth.getUser(bearer)
      if (!error && data.user?.id === callerId) return callerId
    } catch {
      /* ignore */
    }
  }

  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (user?.id === callerId) return callerId
  return null
}

async function resolveOrgId(
  admin: ReturnType<typeof createAdminClient>,
  callerId: string,
  clientOrgId: string | null,
): Promise<{ orgId: string | null; role: string; profileMissing: boolean }> {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', callerId)
    .maybeSingle()

  if (profileError) {
    console.error('[supply-auth] profile fetch failed', profileError.message)
  }

  if (!profile) {
    return { orgId: null, role: '', profileMissing: true }
  }

  const role = canonicalRoleKey(profile.role) ?? String(profile.role ?? '')
  let orgId = profile.organization_id ?? null

  if (!orgId && clientOrgId) {
    const { data: org } = await admin
      .from('organizations')
      .select('id')
      .eq('id', clientOrgId)
      .maybeSingle()
    if (org?.id) {
      orgId = org.id
      await admin
        .from('profiles')
        .update({ organization_id: orgId })
        .eq('id', callerId)
        .is('organization_id', null)
    }
  }

  if (!orgId) {
    const { data: orgs } = await admin.from('organizations').select('id').limit(2)
    if (orgs?.length === 1) {
      orgId = orgs[0].id
      await admin
        .from('profiles')
        .update({ organization_id: orgId })
        .eq('id', callerId)
        .is('organization_id', null)
    }
  }

  if (orgId && clientOrgId && profile.organization_id && clientOrgId !== profile.organization_id) {
    return { orgId: null, role, profileMissing: false }
  }

  return { orgId, role, profileMissing: false }
}

export async function resolveSupplyAuthedUser(
  request: Request,
  callerId: string,
  body?: Record<string, unknown>,
): Promise<SupplyAuthed | NextResponse> {
  if (!callerId?.trim()) {
    return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
  }

  const authedId = await resolveAuthedUserId(request, callerId)
  if (!authedId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const clientOrgId = clientOrgIdFromRequest(request, body)
  const { orgId, role, profileMissing } = await resolveOrgId(admin, callerId, clientOrgId)

  if (profileMissing) {
    return NextResponse.json(
      {
        error:
          'No staff profile for your account. Ask an admin to add you under Users & Roles.',
      },
      { status: 403 },
    )
  }

  if (!orgId) {
    return NextResponse.json(
      {
        error:
          'Your account is not linked to a hotel. Ask an admin to assign your organization in Users & Roles.',
      },
      { status: 403 },
    )
  }

  return {
    userId: callerId,
    orgId,
    role,
  }
}

export function requireSupplyPermission(
  auth: SupplyAuthed,
  permission: Parameters<typeof hasPermission>[1],
): NextResponse | null {
  if (!hasPermission(auth.role, permission)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
