import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isOrganizationMenuRecord,
  isPossessivePropertyHotelOrganizationName,
} from '@/lib/utils/ledger-organization'
import { normalizeNameKey } from '@/lib/utils/name-format'

export type CounterpartyOrganizationOption = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  org_type?: string | null
  created_by?: string | null
  balance?: number
  source: 'organizations' | 'city_ledger'
  /** Set when a matching city_ledger_accounts row exists. */
  ledger_account_id?: string
}

export async function resolveHotelTenantOrganizationId(
  supabase: SupabaseClient,
  knownTenantId?: string | null,
): Promise<string | null> {
  const tid = String(knownTenantId ?? '').trim()
  if (tid) return tid
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()
  return profile?.organization_id ?? null
}

function escapeIlikePattern(term: string): string {
  return term.replace(/[%_\\]/g, '\\$&')
}

/** Client-side filter — same pattern as guest search in booking modals. */
export function filterCounterpartyOrganizationsClient(
  rows: CounterpartyOrganizationOption[],
  term: string,
  limit = 30,
): CounterpartyOrganizationOption[] {
  const q = String(term ?? '').trim()
  if (!q) return []
  const key = normalizeNameKey(q)
  return rows
    .filter((o) => {
      const nameKey = normalizeNameKey(o.name)
      if (nameKey.includes(key)) return true
      if ((o.phone || '').includes(q)) return true
      const email = String(o.email || '').toLowerCase()
      if (email && !email.endsWith('@counterparty.invalid') && email.includes(q.toLowerCase())) {
        return true
      }
      return false
    })
    .slice(0, limit)
}

export function mergeCounterpartyOrganizationRows(
  orgRows: Array<{
    id: string
    name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    org_type?: string | null
    created_by?: string | null
  }>,
  ledgerRows: Array<{
    id: string
    account_name?: string | null
    contact_phone?: string | null
    contact_email?: string | null
    account_type?: string | null
    balance?: number | null
  }>,
  tenantOrganizationId: string,
): CounterpartyOrganizationOption[] {
  const byKey = new Map<string, CounterpartyOrganizationOption>()

  for (const row of ledgerRows) {
    const name = String(row.account_name ?? '').trim()
    if (!name || isPossessivePropertyHotelOrganizationName(name)) continue
    const key = normalizeNameKey(name)
    if (!key) continue
    byKey.set(key, {
      id: row.id,
      name,
      email: row.contact_email ?? null,
      phone: row.contact_phone ?? null,
      org_type: 'other',
      balance: Number(row.balance ?? 0),
      source: 'city_ledger',
      ledger_account_id: row.id,
    })
  }

  for (const row of orgRows) {
    if (!isOrganizationMenuRecord(row, tenantOrganizationId)) continue
    const name = String(row.name ?? '').trim()
    if (!name) continue
    const key = normalizeNameKey(name)
    if (!key) continue
    const existing = byKey.get(key)
    byKey.set(key, {
      id: row.id,
      name,
      email: row.email ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      org_type: row.org_type ?? null,
      created_by: row.created_by ?? null,
      balance: existing?.balance ?? 0,
      source: 'organizations',
      ledger_account_id: existing?.ledger_account_id,
    })
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchCounterpartyOrganizationSources(
  supabase: SupabaseClient,
  tenantId: string,
  params: { searchTerm?: string; limit?: number },
) {
  const term = String(params.searchTerm ?? '').trim()
  const limit = params.limit ?? 500

  let orgQuery = supabase
    .from('organizations')
    .select('id, name, email, phone, org_type, created_by')
    .order('name')
    .limit(limit)
  if (term) orgQuery = orgQuery.ilike('name', `%${escapeIlikePattern(term)}%`)

  let ledgerQuery = supabase
    .from('city_ledger_accounts')
    .select('id, account_name, contact_phone, contact_email, account_type, balance')
    .eq('organization_id', tenantId)
    .in('account_type', ['organization', 'corporate'])
    .order('account_name')
    .limit(limit)
  if (term) ledgerQuery = ledgerQuery.ilike('account_name', `%${escapeIlikePattern(term)}%`)

  const [{ data: orgRows, error: orgErr }, { data: ledgerRows, error: ledgerErr }] = await Promise.all([
    orgQuery,
    ledgerQuery,
  ])

  if (orgErr) console.warn('[counterparty-orgs] organizations:', orgErr.message)
  if (ledgerErr) console.warn('[counterparty-orgs] city_ledger:', ledgerErr.message)

  return mergeCounterpartyOrganizationRows(orgRows || [], ledgerRows || [], tenantId)
}

/** Load all counterparties for modal preload (no search term). */
export async function loadCounterpartyOrganizations(
  supabase: SupabaseClient,
  hotelTenantOrganizationId?: string | null,
  limit = 2000,
): Promise<CounterpartyOrganizationOption[]> {
  const tenantId = await resolveHotelTenantOrganizationId(supabase, hotelTenantOrganizationId)
  if (!tenantId) return []
  return fetchCounterpartyOrganizationSources(supabase, tenantId, { limit })
}

/**
 * Organizations menu + city ledger counterparties for booking / reservation pickers.
 * Merges city_ledger_accounts (organization/corporate) with organizations rows;
 * the organizations row wins when names match.
 */
export async function searchCounterpartyOrganizations(
  supabase: SupabaseClient,
  params: {
    hotelTenantOrganizationId?: string | null
    searchTerm?: string
    limit?: number
  },
): Promise<CounterpartyOrganizationOption[]> {
  const tenantId = await resolveHotelTenantOrganizationId(supabase, params.hotelTenantOrganizationId)
  if (!tenantId) return []
  return fetchCounterpartyOrganizationSources(supabase, tenantId, {
    searchTerm: params.searchTerm,
    limit: params.limit ?? 30,
  })
}
