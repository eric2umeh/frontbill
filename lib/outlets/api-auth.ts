import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission, canonicalRoleKey, type Permission } from '@/lib/permissions'
import { canAccessOutletDepartment } from '@/lib/outlets/access'
import { isOutletDepartmentKey } from '@/lib/outlets/departments'

export type OutletAuthedContext = {
  userId: string
  organizationId: string
  role: string
}

export async function resolveOutletAuthed(
  request: Request,
  opts?: { permission?: Permission; department?: string },
): Promise<{ ctx: OutletAuthedContext } | { error: string; status: number }> {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (!user?.id) {
    return { error: 'Unauthorized', status: 401 }
  }

  const admin = createAdminClient()
  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (pe || !profile?.organization_id) {
    return { error: 'Profile not found', status: 403 }
  }

  const role = String(profile.role || '')
  const permission = opts?.permission ?? 'outlet:view'
  if (!hasPermission(role, permission)) {
    return { error: 'Forbidden', status: 403 }
  }

  if (opts?.department) {
    if (!isOutletDepartmentKey(opts.department)) {
      return { error: 'Invalid department', status: 400 }
    }
    if (!canAccessOutletDepartment(role, opts.department)) {
      return { error: 'No access to this outlet', status: 403 }
    }
  }

  return {
    ctx: {
      userId: user.id,
      organizationId: profile.organization_id as string,
      role,
    },
  }
}

export function nextOrderNumber(department: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  const prefix = department.replace(/_/g, '').slice(0, 3).toUpperCase() || 'OUT'
  return `${prefix}-${stamp}-${rand}`
}
