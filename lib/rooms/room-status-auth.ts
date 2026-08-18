import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { canUpdateHousekeepingRoomStatus } from '@/lib/rooms/housekeeping-status-auth'

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

/** Read room status remarks / HK labels — any role with rooms or housekeeping view. */
export async function resolveRoomStatusReadAuthed(): Promise<
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
  if (!hasPermission(role, 'rooms:view') && !hasPermission(role, 'housekeeping:view')) {
    return { error: 'You do not have permission to view room status.', status: 403 }
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

export async function resolveHousekeepingStatusWriteAuthed(): Promise<
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
  if (!canUpdateHousekeepingRoomStatus(role)) {
    return {
      error: 'Only Housekeeping staff can change room housekeeping status.',
      status: 403,
    }
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

/** @deprecated Maintenance OOO sync — housekeeping sets OOO via floor status now. */
export function canSetOutOfOrderFromHousekeeping(role: string): boolean {
  return canUpdateHousekeepingRoomStatus(role)
}

export { canUpdateHousekeepingRoomStatus } from '@/lib/rooms/housekeeping-status-auth'
