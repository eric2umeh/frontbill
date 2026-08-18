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
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
