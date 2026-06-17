/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP:
      process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP ??
      (['staging', 'development', 'dev'].includes(
        (process.env.SUPABASE_ENV || process.env.NEXT_PUBLIC_SUPABASE_ENV || '').toLowerCase(),
      )
        ? 'true'
        : 'false'),
    NEXT_PUBLIC_SUPABASE_ENV:
      process.env.NEXT_PUBLIC_SUPABASE_ENV ?? process.env.SUPABASE_ENV ?? '',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: false,
}

export default nextConfig
