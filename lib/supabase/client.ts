import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from '@/lib/config'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseConfig.url
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseConfig.anonKey

  if (!url || !key) {
    console.warn('Supabase not configured - returning null for createClient()')
    return null as any
  }

  try {
    const client = createBrowserClient(url, key)

    if (process.env.NODE_ENV === 'production') {
      client.removeAllChannels()
    }

    return client
  } catch (error) {
    console.error('Failed to create Supabase client:', error)
    return null as any
  }
}
