import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from '@/lib/config'
import { isTransientNetworkError, withFetchRetry } from '@/lib/utils/fetch-retry'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseConfig.url
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseConfig.anonKey

  if (!url || !key) {
    console.warn('Supabase not configured - returning null for createClient()')
    return null as any
  }

  try {
    const client = createBrowserClient(url, key, {
      global: {
        fetch: async (input, init) => {
          try {
            return await withFetchRetry(() => fetch(input, init), {
              retries: 2,
              baseDelayMs: 400,
              retryIf: isTransientNetworkError,
            })
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                '[Supabase] Network request failed — verify NEXT_PUBLIC_SUPABASE_URL and that your project is reachable.',
                error,
              )
            }
            throw error
          }
        },
      },
    })

    if (process.env.NODE_ENV === 'production') {
      client.removeAllChannels()
    }

    return client
  } catch (error) {
    console.error('Failed to create Supabase client:', error)
    return null as any
  }
}
