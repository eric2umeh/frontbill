import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeNameKey } from '@/lib/utils/name-format'

export function describeSupabaseError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const row = error as { message?: string; details?: string; hint?: string; code?: string }
    if (row.message) return row.message
    if (row.details) return row.details
    if (row.hint) return row.hint
    if (row.code) return row.code
  }
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

/** Placeholder when no email — satisfies NOT NULL UNIQUE on organizations.email. */
export function counterpartyOrganizationEmail(name: string, explicit?: string | null): string {
  const trimmed = explicit?.trim()
  if (trimmed) return trimmed
  const slug =
    normalizeNameKey(name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'org'
  return `noreply+${slug}-${Date.now().toString(36)}@counterparty.invalid`
}

export type CounterpartyOrganizationInput = {
  name: string
  org_type: string
  email?: string | null
  phone?: string | null
  contact_person?: string | null
  address?: string | null
  created_by: string
}

export function buildCounterpartyOrganizationRow(input: CounterpartyOrganizationInput) {
  const name = input.name.trim()
  const email = counterpartyOrganizationEmail(name, input.email)
  return {
    name,
    org_type: input.org_type,
    email,
    phone: input.phone?.trim() || null,
    contact_person: input.contact_person?.trim() || null,
    address: input.address?.trim() || null,
    current_balance: 0,
    created_by: input.created_by,
  }
}

/** Ensure a matching city ledger account exists for this counterparty name. */
export async function ensureCityLedgerAccountForCounterparty(
  supabase: SupabaseClient,
  hotelTenantOrganizationId: string,
  accountName: string,
  contact?: { phone?: string | null; email?: string | null },
): Promise<void> {
  const trimmed = accountName.trim()
  if (!trimmed) return

  const { data: existing } = await supabase
    .from('city_ledger_accounts')
    .select('id')
    .eq('organization_id', hotelTenantOrganizationId)
    .ilike('account_name', trimmed)
    .maybeSingle()

  if (existing?.id) return

  const { error } = await supabase.from('city_ledger_accounts').insert({
    organization_id: hotelTenantOrganizationId,
    account_name: trimmed,
    account_type: 'organization',
    contact_phone: contact?.phone?.trim() || null,
    contact_email: contact?.email?.trim() || null,
    balance: 0,
  })

  if (error) {
    console.warn('[counterparty-org] city ledger insert skipped:', error.message)
  }
}
