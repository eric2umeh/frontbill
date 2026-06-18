/**
 * Public self-signup at /auth/sign-up (hotel owner registration).
 *
 * Enabled explicitly with NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP=true. For local/preview
 * builds only, SUPABASE_ENV=staging/dev may also enable it.
 */
const SIGNUP_ENV_LABELS = new Set(['staging', 'development', 'dev'])

function explicitSignupFlag(): boolean | null {
  const flag = process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP?.trim().toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false
  return null
}

function isProductionDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase()
  if (vercelEnv) return vercelEnv === 'production'
  return process.env.NODE_ENV === 'production'
}

function envAllowsSignupDefault(): boolean {
  if (isProductionDeployment()) return false
  const env = (
    process.env.SUPABASE_ENV ||
    process.env.NEXT_PUBLIC_SUPABASE_ENV ||
    ''
  )
    .trim()
    .toLowerCase()
  return SIGNUP_ENV_LABELS.has(env)
}

export function isPublicSignupEnabled(): boolean {
  const flag = explicitSignupFlag()
  if (flag != null) return flag
  return envAllowsSignupDefault()
}

/** Client-safe check (uses NEXT_PUBLIC_* only). */
export function isPublicSignupEnabledClient(): boolean {
  return explicitSignupFlag() === true
}
