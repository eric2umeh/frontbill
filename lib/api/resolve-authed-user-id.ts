import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export { callerMatchesSession } from '@/lib/api/caller-session-match'

/**
 * Resolve the authenticated user for an API route (cookie session or Bearer token).
 * Callers that accept a client-supplied `caller_id` must require
 * `authed === caller_id` before using the service-role admin client.
 */
export async function resolveAuthedUserId(request: Request): Promise<string | null> {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (user?.id) return user.id

  const raw = request.headers.get('authorization')?.trim()
  const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
  if (!bearer) return null

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}
