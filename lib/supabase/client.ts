import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig, isConfigured } from '@/lib/config'

export function createClient() {
  // Try environment variables first, fall back to config file
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseConfig.url
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseConfig.anonKey

  if (!url || !key) {
    // Silently return null - allow demo mode to work
    return null
  }

  const client = createBrowserClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })

  // Disable verbose logging to reduce network requests
  if (process.env.NODE_ENV === 'production') {
    client.removeAllChannels()
  }

  return client
}

