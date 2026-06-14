import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'

export type RoomStatusAuthedContext = {
  userId: string
  organizationId: string
  role: string
  userName: string
}

export async function resolveRoomStatusAuthed(): Promise<
  { ctx: RoomStatusAuthedContext } | { error: string; status: number }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', status: 401 }
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, organization_id, full_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.organization_id) {
    return { error: 'Profile not found', status: 403 }
  }

  const role = String(profile.role || '')
  if (!hasPermission(role, 'rooms:update_status')) {
    return { error: 'You do not have permission to update room status.', status: 403 }
  }

  return {
    ctx: {
      userId: user.id,
      organizationId: profile.organization_id as string,
      role,
      userName: String(profile.full_name || '').trim() || 'Staff',
    },
  }
}

export function canSetOutOfOrderFromHousekeeping(role: string): boolean {
  const rk = canonicalRoleKey(role)
  return rk === 'superadmin' || rk === 'admin' || rk === 'housekeeping'
}
