import type { SupabaseClient, User } from '@supabase/supabase-js'

const AUTH_RESOLVE_MS = 8_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/** Prefer local session (fast); fall back to getUser() with a timeout so the UI cannot spin forever. */
export async function resolveBrowserAuthUser(
  supabase: SupabaseClient,
): Promise<{ user: User | null; timedOut: boolean }> {
  const sessionResult = await withTimeout(supabase.auth.getSession(), AUTH_RESOLVE_MS)
  if (sessionResult === null) {
    return { user: null, timedOut: true }
  }
  const { data: sessionData, error: sessionError } = sessionResult
  if (sessionError?.message?.includes('Failed to fetch')) {
    return { user: null, timedOut: false }
  }
  if (sessionData.session?.user) {
    return { user: sessionData.session.user, timedOut: false }
  }

  const result = await withTimeout(supabase.auth.getUser(), AUTH_RESOLVE_MS)
  if (result === null) {
    return { user: null, timedOut: true }
  }
  const { data: { user }, error } = result
  if (error?.message?.includes('Failed to fetch')) {
    return { user: null, timedOut: false }
  }
  return { user: user ?? null, timedOut: false }
}
