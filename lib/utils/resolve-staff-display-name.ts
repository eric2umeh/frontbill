import type { SupabaseClient } from '@supabase/supabase-js'

/** Best-effort label for a staff user (profile + auth metadata + email). */
export async function resolveStaffDisplayName(
  admin: SupabaseClient,
  userId: string,
  profileFullName: string | null | undefined,
): Promise<string> {
  const fromProfile = String(profileFullName || '').trim()
  if (fromProfile) return fromProfile
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data?.user) return 'Staff'
  const u = data.user
  const meta = String(u.user_metadata?.full_name || '').trim()
  const emailLocal = u.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || ''
  return meta || emailLocal || u.email || 'Staff'
}
