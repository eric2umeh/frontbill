/**
 * Public self-signup at /auth/sign-up (hotel owner registration).
 *
 * Enabled when NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP=true, or SUPABASE_ENV is staging/dev.
 * Disable before production: NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP=false on Vercel.
 */
export function isPublicSignupEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP?.trim().toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false

  const env = (
    process.env.SUPABASE_ENV ||
    process.env.NEXT_PUBLIC_SUPABASE_ENV ||
    ''
  )
    .trim()
    .toLowerCase()

  return env === 'staging' || env === 'development' || env === 'dev'
}

/** Client-safe check (uses NEXT_PUBLIC_* only). */
export function isPublicSignupEnabledClient(): boolean {
  const flag = process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP?.trim().toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false

  const env = (process.env.NEXT_PUBLIC_SUPABASE_ENV || '').trim().toLowerCase()
  return env === 'staging' || env === 'development' || env === 'dev'
}
