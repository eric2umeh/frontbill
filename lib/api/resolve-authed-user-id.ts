import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function resolveAuthedUserId(request: Request): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.id) return user.id
  } catch {
    // Fall through to bearer-token auth; if that also fails, the caller is unauthenticated.
  }

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

export async function callerMatchesAuthenticatedUser(
  request: Request,
  callerId: string,
): Promise<boolean> {
  const authedUserId = await resolveAuthedUserId(request)
  return !!authedUserId && authedUserId === callerId
}
