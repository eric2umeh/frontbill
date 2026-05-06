import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeNameKey } from '@/lib/utils/name-format'
import {
  isPossessivePropertyHotelOrganizationName,
  isSelectableLedgerName,
} from '@/lib/utils/ledger-organization'
import { guestOrOrganizationNameTaken } from '@/lib/utils/guest-org-name-uniqueness'

/**
 * Ledger org bookings sometimes only have city_ledger_accounts rows; the Organizations menu reads from
 * organizations. Heal: for each tenant-scoped corporate ledger account without a counterpart org row, insert one;
 * if a matching org row lacks org_type, set org_type to 'other'.
 */
export async function syncLedgerOrgCounterpartiesToOrganizationsTable(
  supabase: SupabaseClient,
  params: { hotelTenantOrganizationId: string | null | undefined; createdByUserId: string | null | undefined },
): Promise<void> {
  const tid = params.hotelTenantOrganizationId
  const createdByUserId = params.createdByUserId
  if (!tid || !createdByUserId) return

  const { data: ledgers, error: le } = await supabase
    .from('city_ledger_accounts')
    .select('id, account_name')
    .eq('organization_id', tid)
    .in('account_type', ['organization', 'corporate'])

  if (le || !ledgers?.length) return

  const byKey = new Map<string, string>()
  for (const row of ledgers) {
    const raw = String((row as { account_name?: string }).account_name ?? '').trim()
    if (!raw) continue
    const k = normalizeNameKey(raw)
    if (!k || byKey.has(k)) continue
    if (!isSelectableLedgerName(raw)) continue
    if (isPossessivePropertyHotelOrganizationName(raw)) continue
    byKey.set(k, raw)
  }

  for (const trimmed of byKey.values()) {
    const { data: existingList, error: exErr } = await supabase
      .from('organizations')
      .select('id, org_type')
      .ilike('name', trimmed)

    if (exErr) continue

    const duplicates = ((existingList as { id?: string; org_type?: string }[]) ?? []).filter(
      (row) => row.id && row.id !== tid,
    )

    if (duplicates.length > 0) {
      for (const existing of duplicates) {
        const ot = String(existing.org_type ?? '').trim()
        if (!ot && existing.id) {
          await supabase.from('organizations').update({ org_type: 'other' }).eq('id', existing.id)
        }
      }
      continue
    }

    const nameBlocked = await guestOrOrganizationNameTaken(supabase, {
      hotelTenantOrganizationId: tid,
      candidateName: trimmed,
    })
    if (nameBlocked) continue

    const { error: insErr } = await supabase.from('organizations').insert([
      {
        name: trimmed,
        org_type: 'other',
        current_balance: 0,
        created_by: createdByUserId,
      },
    ])
    if (insErr) {
      console.warn('[syncLedgerOrgCounterparties] insert skipped:', trimmed, insErr.message)
    }
  }
}
