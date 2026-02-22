import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig, isConfigured } from '@/lib/config'

export function createClient() {
  // Try environment variables first, fall back to config file
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseConfig.url
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseConfig.anonKey

  if (!url || !key) {
    console.warn('[v0] Supabase not configured. Missing environment variables.')
    return null
  }

  return createBrowserClient(url, key)
}

