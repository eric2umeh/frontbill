/** @type {import('next').NextConfig} */
const signupEnvLabels = new Set(['staging', 'development', 'dev'])
const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()
const isProductionDeployment = vercelEnv
  ? vercelEnv === 'production'
  : process.env.NODE_ENV === 'production'
const signupFlag = process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP
const signupDefault =
  !isProductionDeployment &&
  signupEnvLabels.has(
    (process.env.SUPABASE_ENV || process.env.NEXT_PUBLIC_SUPABASE_ENV || '').toLowerCase(),
  )

const nextConfig = {
  env: {
    NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP:
      signupFlag ?? (signupDefault ? 'true' : 'false'),
    NEXT_PUBLIC_SUPABASE_ENV:
      process.env.NEXT_PUBLIC_SUPABASE_ENV ?? process.env.SUPABASE_ENV ?? '',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: false,
}

export default nextConfig
