import type { SupabaseClient } from '@supabase/supabase-js'
import { isOutletFolioDescription } from '@/lib/outlets/booking-folio'

export type FolioChargeForLedgerReversal = {
  amount?: unknown
  charge_type?: string | null
  payment_method?: string | null
  payment_status?: string | null
  ledger_account_id?: string | null
  ledger_account_type?: string | null
  description?: string | null
}

export type CityLedgerReversalPlan = {
  /** Sum to subtract from city_ledger_accounts.balance, keyed by account id. */
  byAccountId: Array<{ accountId: string; amount: number; orgMirrorAmount: number }>
  /**
   * Stay charges posted to a named account without ledger_account_id
   * (walk-in check-in writes "City Ledger: {name}" on the booking).
   */
  byAccountName: Array<{ accountName: string; amount: number }>
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function norm(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/** Account name stored by check-in / new booking notes. Ignores the "account" placeholder. */
export function parseCityLedgerAccountNameFromNotes(
  notes: string | null | undefined,
): string | null {
  if (!notes) return null
  for (const line of notes.split('\n')) {
    const match = line.match(/City Ledger:\s*([^|\n]+)/i)
    if (!match) continue
    const name = match[1].trim()
    if (!name || name.toLowerCase() === 'account') continue
    return name
  }
  return null
}

function isCityLedgerMethod(method: string): boolean {
  return method === 'city_ledger' || method === 'room_charge'
}

function isReversedStatus(status: string): boolean {
  if (!status) return true
  if (status === 'paid') return false
  return (
    status === 'city_ledger' ||
    status === 'pending' ||
    status === 'unpaid' ||
    status === 'posted_to_ledger'
  )
}

/**
 * Charges whose creation also added the same amount to a city ledger account.
 * Outlet lines are excluded: the order survives booking delete, so its ledger
 * posting must stay. Paid lines are excluded: a later settlement already
 * reduced the account.
 */
export function planCityLedgerReversalsForDeletedBooking(
  charges: FolioChargeForLedgerReversal[],
  bookingNotes?: string | null,
): CityLedgerReversalPlan {
  const byId = new Map<string, { amount: number; orgMirrorAmount: number }>()
  const byName = new Map<string, number>()
  const noteName = parseCityLedgerAccountNameFromNotes(bookingNotes)

  for (const charge of charges) {
    const amount = Number(charge.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (isOutletFolioDescription(charge.description)) continue

    const method = norm(charge.payment_method)
    const status = norm(charge.payment_status)
    const chargeType = norm(charge.charge_type)
    if (!isCityLedgerMethod(method) && status !== 'city_ledger' && status !== 'posted_to_ledger') {
      continue
    }
    if (!isReversedStatus(status)) continue

    const accountId = String(charge.ledger_account_id || '').trim()
    if (accountId) {
      const prev = byId.get(accountId) ?? { amount: 0, orgMirrorAmount: 0 }
      prev.amount = roundMoney(prev.amount + amount)
      if (norm(charge.ledger_account_type) === 'organization') {
        prev.orgMirrorAmount = roundMoney(prev.orgMirrorAmount + amount)
      }
      byId.set(accountId, prev)
      continue
    }

    // Walk-in check-in stores the company name on the booking, not the folio line.
    if (!noteName) continue
    if (chargeType !== 'room_charge' && chargeType !== 'extended_stay') continue
    byName.set(noteName, roundMoney((byName.get(noteName) ?? 0) + amount))
  }

  return {
    byAccountId: [...byId.entries()].map(([accountId, totals]) => ({
      accountId,
      amount: totals.amount,
      orgMirrorAmount: totals.orgMirrorAmount,
    })),
    byAccountName: [...byName.entries()].map(([accountName, amount]) => ({
      accountName,
      amount,
    })),
  }
}

/** Signed balance: positive owes the hotel, negative is prepaid credit. Never clamp. */
export function ledgerBalanceAfterReversal(current: unknown, amount: number): number {
  return roundMoney((Number(current) || 0) - amount)
}

type AccountRow = {
  id: string
  balance: number | string | null
  account_type: string | null
  account_name?: string | null
}

/**
 * Subtract planned stay charges from city ledger balances after the booking row is gone.
 * Name matches apply only when exactly one account in the hotel has that name.
 */
export async function applyCityLedgerReversals(
  admin: SupabaseClient,
  organizationId: string,
  plan: CityLedgerReversalPlan,
): Promise<void> {
  const pending = new Map<string, { amount: number; orgMirrorAmount: number }>()

  for (const row of plan.byAccountId) {
    if (row.amount <= 0) continue
    pending.set(row.accountId, {
      amount: row.amount,
      orgMirrorAmount: row.orgMirrorAmount,
    })
  }

  for (const row of plan.byAccountName) {
    if (row.amount <= 0 || !row.accountName.trim()) continue
    const exactName = row.accountName.trim().replace(/[%_\\]/g, (ch) => `\\${ch}`)
    const { data, error } = await admin
      .from('city_ledger_accounts')
      .select('id, balance, account_type, account_name')
      .eq('organization_id', organizationId)
      .ilike('account_name', exactName)

    if (error) throw new Error(error.message)
    const matches = (data || []) as AccountRow[]
    if (matches.length !== 1) continue
    const id = matches[0].id
    const prev = pending.get(id) ?? { amount: 0, orgMirrorAmount: 0 }
    prev.amount = roundMoney(prev.amount + row.amount)
    pending.set(id, prev)
  }

  const updatedAt = new Date().toISOString()
  for (const [accountId, totals] of pending) {
    const { data: acct, error: loadErr } = await admin
      .from('city_ledger_accounts')
      .select('id, balance, account_type')
      .eq('id', accountId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (loadErr) throw new Error(loadErr.message)
    if (!acct) continue

    const nextBalance = ledgerBalanceAfterReversal(acct.balance, totals.amount)
    const { error: upErr } = await admin
      .from('city_ledger_accounts')
      .update({ balance: nextBalance, updated_at: updatedAt })
      .eq('id', accountId)
      .eq('organization_id', organizationId)
    if (upErr) throw new Error(upErr.message)

    const mirror =
      norm(acct.account_type) === 'organization' ? totals.orgMirrorAmount : 0
    if (mirror <= 0) continue

    const { data: orgRow, error: orgErr } = await admin
      .from('organizations')
      .select('current_balance')
      .eq('id', accountId)
      .maybeSingle()
    if (orgErr) throw new Error(orgErr.message)
    if (!orgRow) continue

    const { error: orgUpErr } = await admin
      .from('organizations')
      .update({
        current_balance: ledgerBalanceAfterReversal(orgRow.current_balance, mirror),
      })
      .eq('id', accountId)
    if (orgUpErr) throw new Error(orgUpErr.message)
  }
}
