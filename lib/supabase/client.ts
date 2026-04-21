import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig, isConfigured } from '@/lib/config'

export function createClient() {
  // Read directly from process.env every time (not from cached config)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseConfig.url
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseConfig.anonKey

  if (!url || !key) {
    // Create a dummy client that won't crash but will handle errors gracefully
    console.warn('Supabase not configured - returning null for createClient()')
    return null as any
  }

  try {
    const client = createBrowserClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'supabase-auth-token',
      },
    })

    // Disable verbose logging to reduce network requests
    if (process.env.NODE_ENV === 'production') {
      client.removeAllChannels()
    }

    return client
  } catch (error) {
    console.error('Failed to create Supabase client:', error)
    return null as any
  }
}

