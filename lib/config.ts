// Configuration file - Get credentials from environment variables only
// NEVER hardcode secrets here - they will be exposed in git history

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
}

export const isConfigured = () => {
  return supabaseConfig.url && supabaseConfig.anonKey && supabaseConfig.url.includes('supabase.co')
}
