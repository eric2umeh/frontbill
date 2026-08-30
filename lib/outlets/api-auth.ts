import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission, canonicalRoleKey, type Permission } from '@/lib/permissions'
import {
  canAccessOutletDepartment,
  canAuditorEditOutletMenuPricing,
  canManageOutletMenu,
  canManageOutletOrders,
} from '@/lib/outlets/access'
import { isOutletDepartmentKey, type OutletDepartmentKey } from '@/lib/outlets/departments'

export type OutletAuthedContext = {
  userId: string
  organizationId: string
  role: string
}

export async function resolveOutletAuthed(
  request: Request,
  opts?: { permission?: Permission; department?: string },
): Promise<{ ctx: OutletAuthedContext } | { error: string; status: number }> {
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
      userId,
      organizationId: profile.organization_id as string,
      role,
    },
  }
}

/** Auth for POST/PATCH/DELETE on outlet menu — F&B, superadmin, admin, manager; Main Bar admin/superadmin only. */
export async function resolveOutletMenuManage(
  request: Request,
  opts?: { department?: string },
): Promise<{ ctx: OutletAuthedContext } | { error: string; status: number }> {
  const auth = await resolveOutletAuthed(request, {
    permission: 'outlet:view',
    department: opts?.department,
  })
  if ('error' in auth) return auth

  const dept =
    opts?.department && isOutletDepartmentKey(opts.department)
      ? opts.department
      : undefined

  if (dept && !canManageOutletMenu(auth.ctx.role, dept)) {
    return {
      error:
        dept === 'main_bar'
          ? 'Only Superadmin or Administrator can change the Main Bar menu'
          : 'Only F&B, Superadmin, Administrator, or Manager can change the outlet menu',
      status: 403,
    }
  }

  if (!dept && !canManageOutletMenu(auth.ctx.role)) {
    return {
      error: 'Only F&B, Superadmin, Administrator, or Manager can change the outlet menu',
      status: 403,
    }
  }
  return auth
}

const AUDITOR_MENU_PATCH_KEYS = new Set(['unit_price', 'category_id'])

/** Auth for PATCH outlet menu item — full manage or auditor price/category on Main Bar / Restaurant. */
export function canPatchOutletMenuItem(
  role: string,
  department: OutletDepartmentKey,
  body: Record<string, unknown>,
): { ok: true; auditorLimited: boolean } | { error: string } {
  if (canManageOutletMenu(role, department)) {
    return { ok: true, auditorLimited: false }
  }
  if (!canAuditorEditOutletMenuPricing(role, department)) {
    return {
      error:
        department === 'main_bar'
          ? 'Only Superadmin, Administrator, or Auditor can change Main Bar menu price/category'
          : 'Only F&B, Superadmin, Administrator, Manager, or Auditor can change this menu',
    }
  }
  const keys = Object.keys(body).filter((k) => k !== 'id' && body[k] !== undefined)
  if (!keys.length || keys.every((k) => AUDITOR_MENU_PATCH_KEYS.has(k))) {
    return { ok: true, auditorLimited: true }
  }
  return { error: 'Auditor may only change category and price on this menu' }
}

/** Auth for PATCH/DELETE on outlet orders — superadmin, admin, manager only. */
export async function resolveOutletOrderManage(
  request: Request,
  opts?: { department?: string },
): Promise<{ ctx: OutletAuthedContext } | { error: string; status: number }> {
  const auth = await resolveOutletAuthed(request, {
    permission: 'outlet:view',
    department: opts?.department,
  })
  if ('error' in auth) return auth
  if (!canManageOutletOrders(auth.ctx.role)) {
    return {
      error: 'Only Superadmin, Administrator, or Manager can edit or delete outlet orders',
      status: 403,
    }
  }
  return auth
}

export function nextOrderNumber(department: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  const prefix = department.replace(/_/g, '').slice(0, 3).toUpperCase() || 'OUT'
  return `${prefix}-${stamp}-${rand}`
}
