import type { SupabaseClient } from '@supabase/supabase-js'
import { isNoShowPolicyColumnError } from '@/lib/reservations/no-show-policy'

export type CashbackConfig = {
  enabled: boolean
  percent: number
}

export const DEFAULT_CASHBACK_CONFIG: CashbackConfig = {
  enabled: true,
  percent: 2,
}

export async function fetchCashbackConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CashbackConfig> {
  const { data, error } = await supabase
    .from('organizations')
    .select('cashback_enabled, cashback_percent')
    .eq('id', organizationId)
    .maybeSingle()

  if (error) {
    if (!isNoShowPolicyColumnError(error)) {
      console.warn('[fetchCashbackConfig]', error.message)
    }
    return DEFAULT_CASHBACK_CONFIG
  }

  return {
    enabled: data?.cashback_enabled !== false,
    percent: Number(data?.cashback_percent ?? 2),
  }
}

/** Payments that earn cashback (actual money received). */
export function paymentMethodEarnsCashback(method: string | null | undefined): boolean {
  const m = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  return m === 'cash' || m === 'pos' || m === 'transfer' || m === 'card'
}

export function calculateCashbackEarnAmount(
  paymentAmount: number,
  percent: number,
): number {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return 0
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return Math.round(paymentAmount * (percent / 100) * 100) / 100
}
