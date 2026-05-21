import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageEvents, canViewEvents } from '@/lib/events/access'

export type EventsAuthedContext = {
  userId: string
  organizationId: string
  role: string
}

export async function resolveEventsAuthed(
  request: Request,
  opts?: { requireManage?: boolean },
): Promise<{ ctx: EventsAuthedContext } | { error: string; status: number }> {
  const admin = createAdminClient()
  const cookieSb = await createClient()
  const {
    data: { user: cookieUser },
  } = await cookieSb.auth.getUser()

  let userId: string | null = cookieUser?.id ?? null
  if (!userId) {
    const raw = request.headers.get('authorization')?.trim()
    const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
    if (bearer) {
      const { data: jwtUserData, error: jwtError } = await admin.auth.getUser(bearer)
      if (!jwtError && jwtUserData.user?.id) userId = jwtUserData.user.id
    }
  }

  if (!userId) {
    return { error: 'Unauthorized', status: 401 }
  }

  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', userId)
    .single()

  if (pe || !profile?.organization_id) {
    return { error: 'Profile not found', status: 403 }
  }

  const role = String(profile.role || '')
  if (opts?.requireManage) {
    if (!canManageEvents(role)) {
      return { error: 'Only Superadmin, Administrator, Manager, or Front Desk can change events', status: 403 }
    }
  } else if (!canViewEvents(role)) {
    return { error: 'Forbidden', status: 403 }
  }

  return {
    ctx: {
      userId,
      organizationId: profile.organization_id as string,
      role,
    },
  }
}
