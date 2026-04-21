// Configuration file - credentials loaded from environment variables at runtime

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
}

export const isConfigured = () => {
  return supabaseConfig.url && supabaseConfig.anonKey && supabaseConfig.url.includes('supabase.co')
}
