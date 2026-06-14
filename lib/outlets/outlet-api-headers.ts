import { createClient } from '@/lib/supabase/client'

/** Auth headers for outlet API routes (cookie + Bearer for browser localStorage sessions). */
export async function outletApiHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra }
  try {
    const supabase = createClient()
    if (!supabase) return headers
    const { data: { session }, error } = await supabase.auth.getSession()
    if (!error && session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }
  } catch {
    // Supabase unreachable — same-origin API routes may still use session cookies
  }
  return headers
}
