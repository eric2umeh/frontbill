import type { SupabaseClient } from '@supabase/supabase-js'

export type NoShowFeeMode = 'percent' | 'flat_night' | 'flat_stay'

export type NoShowPolicy = {
  feeMode: NoShowFeeMode
  feePercent: number
  feeFlatAmount: number
}

export const DEFAULT_NO_SHOW_POLICY: NoShowPolicy = {
  feeMode: 'percent',
  feePercent: 100,
  feeFlatAmount: 0,
}

/** PostgREST when policy columns are missing (run scripts/073). */
export function isNoShowPolicyColumnError(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  const m = (err?.message || '').toLowerCase()
  if (!m) return false
  const mentionsCol =
    m.includes('no_show_fee') ||
    m.includes('cashback_') ||
    m.includes('no_show_at')
  if (!mentionsCol) return false
  return (
    m.includes('does not exist') ||
    m.includes('undefined column') ||
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('42703')
  )
}

export async function fetchNoShowPolicy(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<NoShowPolicy> {
  const { data, error } = await supabase
    .from('organizations')
    .select('no_show_fee_mode, no_show_fee_percent, no_show_fee_flat_amount')
    .eq('id', organizationId)
    .maybeSingle()

  if (error) {
    if (!isNoShowPolicyColumnError(error)) {
      console.warn('[fetchNoShowPolicy]', error.message)
    }
    return DEFAULT_NO_SHOW_POLICY
  }

  const mode = String(data?.no_show_fee_mode || 'percent').toLowerCase()
  const feeMode: NoShowFeeMode =
    mode === 'flat_night' || mode === 'flat_stay' ? mode : 'percent'

  return {
    feeMode,
    feePercent: Number(data?.no_show_fee_percent ?? 100),
    feeFlatAmount: Number(data?.no_show_fee_flat_amount ?? 0),
  }
}

export function bookingStayNights(input: {
  check_in?: string | null
  check_out?: string | null
  number_of_nights?: number | null
}): number {
  const fromField = Number(input.number_of_nights)
  if (Number.isFinite(fromField) && fromField > 0) return Math.round(fromField)

  const inD = input.check_in ? new Date(input.check_in) : null
  const outD = input.check_out ? new Date(input.check_out) : null
  if (!inD || !outD || Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime())) {
    return 1
  }
  const ms = outD.getTime() - inD.getTime()
  const nights = Math.ceil(ms / (1000 * 60 * 60 * 24))
  return Math.max(1, nights)
}

/** Room-rate base used for percent no-show fees. */
export function bookingRoomRateBase(input: {
  rate_per_night?: number | null
  total_amount?: number | null
  check_in?: string | null
  check_out?: string | null
  number_of_nights?: number | null
}): number {
  const nights = bookingStayNights(input)
  const rate = Number(input.rate_per_night ?? 0)
  if (rate > 0) return rate * nights
  const total = Number(input.total_amount ?? 0)
  if (total > 0) return total
  return 0
}

export function calculateNoShowFee(
  policy: NoShowPolicy,
  booking: {
    rate_per_night?: number | null
    total_amount?: number | null
    check_in?: string | null
    check_out?: string | null
    number_of_nights?: number | null
  },
  overrideAmount?: number | null,
): number {
  if (overrideAmount != null && Number.isFinite(overrideAmount) && overrideAmount >= 0) {
    return Math.round(overrideAmount * 100) / 100
  }

  const nights = bookingStayNights(booking)
  const base = bookingRoomRateBase(booking)

  if (policy.feeMode === 'flat_night') {
    return Math.round(Math.max(0, policy.feeFlatAmount) * nights * 100) / 100
  }
  if (policy.feeMode === 'flat_stay') {
    return Math.round(Math.max(0, policy.feeFlatAmount) * 100) / 100
  }

  const pct = Math.max(0, Math.min(100, policy.feePercent))
  return Math.round(base * (pct / 100) * 100) / 100
}

export function describeNoShowPolicy(policy: NoShowPolicy): string {
  if (policy.feeMode === 'flat_night') {
    return `₦${policy.feeFlatAmount.toLocaleString()} per night`
  }
  if (policy.feeMode === 'flat_stay') {
    return `₦${policy.feeFlatAmount.toLocaleString()} per stay`
  }
  return `${policy.feePercent}% of room rate`
}
