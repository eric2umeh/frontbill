import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'

export type NightAuditPendingCounts = {
  backdate: number
  room_change: number
  reschedule_stay: number
  extend_discount: number
  total: number
}

export const EMPTY_NIGHT_AUDIT_PENDING_COUNTS: NightAuditPendingCounts = {
  backdate: 0,
  room_change: 0,
  reschedule_stay: 0,
  extend_discount: 0,
  total: 0,
}

export function isBackdateDeciderRole(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'admin' || k === 'superadmin'
}

async function countPending(
  admin: SupabaseClient,
  table: string,
  organizationId: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'pending')

  if (error) {
    if (/does not exist/i.test(error.message || '')) return 0
    throw error
  }
  return count ?? 0
}

export async function fetchNightAuditPendingCounts(
  admin: SupabaseClient,
  organizationId: string,
  role: string | null | undefined,
): Promise<NightAuditPendingCounts> {
  const counts = { ...EMPTY_NIGHT_AUDIT_PENDING_COUNTS }

  if (isBackdateDeciderRole(role)) {
    counts.backdate = await countPending(admin, 'backdate_requests', organizationId)
  }
  if (hasPermission(role, 'room_change:approve')) {
    counts.room_change = await countPending(admin, 'room_change_requests', organizationId)
  }
  if (hasPermission(role, 'reschedule_stay:approve')) {
    counts.reschedule_stay = await countPending(admin, 'reschedule_stay_requests', organizationId)
  }
  if (hasPermission(role, 'room_change:approve')) {
    counts.extend_discount = await countPending(admin, 'extend_stay_discount_requests', organizationId)
  }

  counts.total =
    counts.backdate +
    counts.room_change +
    counts.reschedule_stay +
    counts.extend_discount

  return counts
}

/** First Night Audit tab with pending items (for sidebar deep link). */
export function nightAuditHrefForPendingCounts(counts: NightAuditPendingCounts): string {
  if (counts.backdate > 0) return '/night-audit?tab=backdate-requests'
  if (counts.room_change > 0) return '/night-audit?tab=room-change-requests'
  if (counts.extend_discount > 0) return '/night-audit?tab=extend-discount'
  if (counts.reschedule_stay > 0) return '/night-audit?tab=reschedule-stay-requests'
  return '/night-audit'
}
