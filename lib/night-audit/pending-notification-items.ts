import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission } from '@/lib/permissions'
import {
  isBackdateDeciderRole,
  nightAuditHrefForPendingCounts,
  type NightAuditPendingCounts,
} from '@/lib/night-audit/pending-approval-counts'

export type NightAuditPendingNotificationItem = {
  id: string
  kind: 'backdate' | 'room_change' | 'reschedule_stay' | 'extend_discount'
  description: string
  created_at: string
  booking_id: string | null
  href: string
}

function tabHref(tab: string): string {
  return `/night-audit?tab=${tab}`
}

export async function fetchNightAuditPendingNotificationItems(
  admin: SupabaseClient,
  organizationId: string,
  role: string | null | undefined,
): Promise<NightAuditPendingNotificationItem[]> {
  const items: NightAuditPendingNotificationItem[] = []

  const loadPending = async (
    table: string,
    kind: NightAuditPendingNotificationItem['kind'],
    tab: string,
    mapRow: (r: Record<string, unknown>) => NightAuditPendingNotificationItem | null,
  ) => {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) {
      if (/does not exist/i.test(error.message || '')) return
      throw error
    }
    for (const row of data || []) {
      const mapped = mapRow(row as Record<string, unknown>)
      if (mapped) items.push(mapped)
    }
  }

  if (isBackdateDeciderRole(role)) {
    await loadPending('backdate_requests', 'backdate', 'backdate-requests', (r) => ({
      id: `backdate-pending-${r.id}`,
      kind: 'backdate',
      description: `${String(r.request_type || 'booking').replace(/_/g, ' ')} backdate · ${String(r.requested_check_in || '').slice(0, 10)}`,
      created_at: String(r.created_at || new Date().toISOString()),
      booking_id: (r.created_booking_id as string) || null,
      href: tabHref('backdate-requests'),
    }))
  }

  if (hasPermission(role, 'room_change:approve')) {
    await loadPending('room_change_requests', 'room_change', 'room-change-requests', (r) => ({
      id: `room-change-pending-${r.id}`,
      kind: 'room_change',
      description: `Room change ${String(r.from_room_label || '—')} → ${String(r.to_room_label || '—')}`,
      created_at: String(r.created_at || new Date().toISOString()),
      booking_id: String(r.booking_id || '') || null,
      href: tabHref('room-change-requests'),
    }))

    await loadPending('extend_stay_discount_requests', 'extend_discount', 'extend-discount', (r) => ({
      id: `extend-discount-pending-${r.id}`,
      kind: 'extend_discount',
      description: `Extend stay discount · ${String(r.new_check_out || '').slice(0, 10)} · ${Number(r.discounted_total) || 0}`,
      created_at: String(r.created_at || new Date().toISOString()),
      booking_id: String(r.booking_id || '') || null,
      href: tabHref('extend-discount'),
    }))
  }

  if (hasPermission(role, 'reschedule_stay:approve')) {
    await loadPending('reschedule_stay_requests', 'reschedule_stay', 'reschedule-stay-requests', (r) => ({
      id: `reschedule-pending-${r.id}`,
      kind: 'reschedule_stay',
      description: `Move dates ${String(r.from_check_in || '').slice(0, 10)} → ${String(r.to_check_in || '').slice(0, 10)}`,
      created_at: String(r.created_at || new Date().toISOString()),
      booking_id: String(r.booking_id || '') || null,
      href: tabHref('reschedule-stay-requests'),
    }))
  }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return items.slice(0, 20)
}

export function nightAuditNotificationHref(counts: NightAuditPendingCounts): string {
  return nightAuditHrefForPendingCounts(counts)
}
