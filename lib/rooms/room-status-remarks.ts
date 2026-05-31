import type { SupabaseClient } from '@supabase/supabase-js'

export type RoomStatusRemark = {
  source: 'housekeeping' | 'maintenance'
  title: string
  text: string
  createdAt: string
  createdBy: string | null
  taskStatus?: string | null
}

function isOutOfOrderStatusNote(notes: string): boolean {
  return /out\s*of\s*order|out_of_order|Status → Out of Order/i.test(notes)
}

/** Latest housekeeping / maintenance notes explaining why a room is OOO or under maintenance. */
export async function fetchRoomStatusRemarks(
  supabase: SupabaseClient,
  organizationId: string,
  roomId: string,
): Promise<RoomStatusRemark[]> {
  const remarks: RoomStatusRemark[] = []

  const { data: hkRows } = await supabase
    .from('housekeeping_tasks')
    .select('notes, created_at, created_by_name, task_type')
    .eq('organization_id', organizationId)
    .eq('room_id', roomId)
    .eq('task_type', 'Room Status Change')
    .order('created_at', { ascending: false })
    .limit(30)

  for (const row of hkRows ?? []) {
    const notes = String(row.notes || '').trim()
    if (!notes || !isOutOfOrderStatusNote(notes)) continue
    remarks.push({
      source: 'housekeeping',
      title: 'Out of order remark',
      text: notes,
      createdAt: row.created_at as string,
      createdBy: (row.created_by_name as string | null) ?? null,
    })
    break
  }

  const { data: mtRows } = await supabase
    .from('maintenance_tasks')
    .select('description, notes, priority, status, created_at, created_by_name')
    .eq('organization_id', organizationId)
    .eq('room_id', roomId)
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(10)

  for (const row of mtRows ?? []) {
    const description = String(row.description || '').trim()
    const notes = String(row.notes || '').trim()
    const text = [description, notes].filter(Boolean).join(' — ')
    if (!text) continue
    remarks.push({
      source: 'maintenance',
      title: `Maintenance work order (${row.status})`,
      text,
      createdAt: row.created_at as string,
      createdBy: (row.created_by_name as string | null) ?? null,
      taskStatus: row.status as string,
    })
  }

  if (remarks.some((r) => r.source === 'maintenance')) {
    return remarks
  }

  const { data: recentMt } = await supabase
    .from('maintenance_tasks')
    .select('description, notes, priority, status, created_at, created_by_name')
    .eq('organization_id', organizationId)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(5)

  for (const row of recentMt ?? []) {
    const description = String(row.description || '').trim()
    const notes = String(row.notes || '').trim()
    const text = [description, notes].filter(Boolean).join(' — ')
    if (!text) continue
    remarks.push({
      source: 'maintenance',
      title: `Recent maintenance (${row.status})`,
      text,
      createdAt: row.created_at as string,
      createdBy: (row.created_by_name as string | null) ?? null,
      taskStatus: row.status as string,
    })
    break
  }

  return remarks
}
