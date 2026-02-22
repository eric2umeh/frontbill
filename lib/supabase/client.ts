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

  return createBrowserClient(url, key)
}

