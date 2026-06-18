import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

type EnsureOpts = {
  userId: string
  email: string
  fullName: string
  hotelName: string
}

/** Link a self-signup owner to a new hotel org (mirrors scripts/066_signup_creates_hotel.sql). */
export async function ensureHotelOwnerProfile(
  admin: SupabaseClient,
  opts: EnsureOpts,
): Promise<{ organizationId: string | null; error?: string }> {
  const { userId, email, fullName, hotelName } = opts

  const { data: profile } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.organization_id) {
    return { organizationId: profile.organization_id }
  }

  const orgName = hotelName.trim() || `${fullName.trim() || email.split('@')[0]} Hotel`

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: orgName, email })
    .select('id')
    .single()

  if (orgError) {
    return { organizationId: null, error: orgError.message }
  }
  const organizationId = org.id

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      organization_id: organizationId,
      full_name: fullName.trim() || email,
      role: 'admin',
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    return { organizationId: null, error: profileError.message }
  }

  return { organizationId }
}

export async function ensureHotelOwnerFromAuthUser(
  user: User,
): Promise<{ organizationId: string | null; error?: string }> {
  const meta = user.user_metadata ?? {}
  const shouldCreate =
    String(meta.create_hotel ?? '').toLowerCase() === 'true' ||
    String(meta.create_hotel ?? '') === '1'

  if (!shouldCreate) {
    return { organizationId: null }
  }

  const admin = createAdminClient()
  return ensureHotelOwnerProfile(admin, {
    userId: user.id,
    email: user.email ?? '',
    fullName: String(meta.full_name ?? user.email ?? ''),
    hotelName: String(meta.hotel_name ?? ''),
  })
}
