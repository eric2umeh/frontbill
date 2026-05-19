import { createClient } from '@/lib/supabase/client'

/** Auth headers for outlet API routes (cookie + Bearer for browser localStorage sessions). */
export async function outletApiHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra }
  const supabase = createClient()
  if (!supabase) return headers
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}
