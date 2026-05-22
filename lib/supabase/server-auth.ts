import type { SupabaseClient, User } from '@supabase/supabase-js'

/** Max wait for Supabase Auth server validation — avoids multi-minute hangs. */
const SERVER_AUTH_TIMEOUT_MS = 12_000

type VerifiedUserResult =
  | { user: User; timedOut: false; error: null }
  | { user: null; timedOut: boolean; error: string | null }

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn(`[auth] ${label} timed out after ${ms}ms`)
        resolve(null)
      }, ms)
    }),
  ])
}

/**
 * Validates the session with Supabase Auth (`getUser`).
 * Use in middleware only (once per request).
 */
export async function getVerifiedServerUser(
  supabase: SupabaseClient,
): Promise<VerifiedUserResult> {
  const raced = await withTimeout(
    supabase.auth.getUser().then(({ data: { user }, error }) => ({
      user: user ?? null,
      error: error?.message ?? null,
    })),
    SERVER_AUTH_TIMEOUT_MS,
    'getUser',
  )

  if (!raced) {
    return { user: null, timedOut: true, error: 'Auth validation timed out' }
  }

  if (raced.user) {
    return { user: raced.user, timedOut: false, error: null }
  }

  return { user: null, timedOut: false, error: raced.error }
}

/**
 * Reads the user from the session cookie (no Auth server round-trip).
 * Safe in Server Components when middleware already ran `getVerifiedServerUser`.
 */
export async function getServerSessionUser(
  supabase: SupabaseClient,
): Promise<User | null> {
  const raced = await withTimeout(
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) return null
      return session?.user ?? null
    }),
    2_000,
    'getSession',
  )
  return raced ?? null
}
