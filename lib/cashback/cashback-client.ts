import type { SupabaseClient } from '@supabase/supabase-js'
import type { CashbackEarnByRateRow } from '@/lib/cashback/cashback-earn-breakdown'

export type GuestCashbackDetail = {
  earnedTotal: number
  redeemedTotal: number
  balance: number
  earnByRate: CashbackEarnByRateRow[]
}

export async function cashbackApiHeaders(
  supabase: SupabaseClient | null,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!supabase) return headers
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

export async function fetchGuestCashbackDetailClient(
  supabase: SupabaseClient | null,
  guestId: string,
): Promise<GuestCashbackDetail> {
  const empty: GuestCashbackDetail = {
    earnedTotal: 0,
    redeemedTotal: 0,
    balance: 0,
    earnByRate: [],
  }
  const headers = await cashbackApiHeaders(supabase)
  const res = await fetch(`/api/guests/${guestId}/cashback`, {
    headers,
    credentials: 'include',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return empty
  const b = json.balance ?? {}
  return {
    earnedTotal: Number(b.earnedTotal ?? 0),
    redeemedTotal: Number(b.redeemedTotal ?? 0),
    balance: Number(b.balance ?? 0),
    earnByRate: Array.isArray(json.earnByRate) ? json.earnByRate : [],
  }
}

export async function fetchGuestCashbackBalanceClient(
  supabase: SupabaseClient | null,
  guestId: string,
): Promise<{ earnedTotal: number; redeemedTotal: number; balance: number }> {
  const detail = await fetchGuestCashbackDetailClient(supabase, guestId)
  return {
    earnedTotal: detail.earnedTotal,
    redeemedTotal: detail.redeemedTotal,
    balance: detail.balance,
  }
}

export async function earnCashbackClient(
  supabase: SupabaseClient | null,
  input: {
    guestId: string
    amount: number
    paymentMethod: string
    sourceType?: string
    sourceId?: string
    description?: string
  },
): Promise<number> {
  const headers = await cashbackApiHeaders(supabase)
  const res = await fetch(`/api/guests/${input.guestId}/cashback`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      action: 'earn',
      amount: input.amount,
      payment_method: input.paymentMethod,
      source_type: input.sourceType,
      source_id: input.sourceId,
      description: input.description,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return 0
  return Number(json.earned ?? 0)
}

export async function redeemCashbackClient(
  supabase: SupabaseClient | null,
  input: {
    guestId: string
    amount: number
    sourceType?: string
    sourceId?: string
    description?: string
  },
): Promise<void> {
  const headers = await cashbackApiHeaders(supabase)
  const res = await fetch(`/api/guests/${input.guestId}/cashback`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      action: 'redeem',
      amount: input.amount,
      source_type: input.sourceType,
      source_id: input.sourceId,
      description: input.description,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Cashback redemption failed')
}
