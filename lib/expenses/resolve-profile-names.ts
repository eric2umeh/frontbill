import type { createAdminClient } from '@/lib/supabase/admin'

export async function resolveProfileNames(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return {}

  const { data } = await admin.from('profiles').select('id, full_name').in('id', ids)
  const map: Record<string, string> = {}
  for (const p of data || []) {
    map[p.id] = String(p.full_name || '').trim() || `User ${String(p.id).slice(0, 8)}`
  }
  return map
}
