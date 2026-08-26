import { createClient } from '@/lib/supabase/client'
import {
  folioGuestCreditAmount,
  folioPositiveOutstandingSum,
  type FolioLineForBalance,
} from '@/lib/utils/booking-bill-balance'
import { pickPreferredGuestLedgerAccount } from '@/lib/utils/guest-city-ledger'

/**
 * Computes the net outstanding balance for a guest across all their bookings.
 *
 * Logic:
 *   - folio_charges with charge_type != 'payment' and payment_status = 'pending' → positive (owed)
 *   - folio_charges with charge_type = 'payment'                                 → negative (paid)
 *   - bookings.total_amount - bookings.deposit (fallback if no folio charges)
 *
 * Returns a positive number = amount still owed by the guest.
 * Returns 0 or negative = fully paid or in credit.
 */
export async function calculateGuestBalance(
  guestId: string,
  organizationId: string
): Promise<number> {
  const supabase = createClient()

  // Get all booking IDs for this guest
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, total_amount, deposit, balance, payment_status')
    .eq('guest_id', guestId)
    .eq('organization_id', organizationId)
    .not('status', 'in', '("cancelled")')

  if (!bookings || bookings.length === 0) {
    const { data: guestRow } = await supabase
      .from('guests')
      .select('name')
      .eq('id', guestId)
      .maybeSingle()
    const guestName = String(guestRow?.name || '').trim()
    if (!guestName) return 0
    const { data: ledgerRows } = await supabase
      .from('city_ledger_accounts')
      .select('balance, account_type')
      .eq('organization_id', organizationId)
      .in('account_type', ['individual', 'guest'])
      .ilike('account_name', guestName)
      .limit(20)
    const preferred = pickPreferredGuestLedgerAccount(ledgerRows || [])
    const led = Number(preferred?.balance ?? 0)
    if (Math.abs(led) > 0.005) return led
    return 0
  }

  const bookingIds = bookings.map(b => b.id)

  // Get all folio charges for these bookings
  const { data: charges } = await supabase
    .from('folio_charges')
    .select('booking_id, amount, charge_type, payment_status, payment_method')
    .in('booking_id', bookingIds)

  if (!charges || charges.length === 0) {
    // Fall back to bookings balance (total - deposit)
    return bookings.reduce((sum, b) => {
      if (b.payment_status === 'paid') return sum
      const owed = (b.total_amount || 0) - (b.deposit || 0)
      return sum + Math.max(0, owed)
    }, 0)
  }

  // Net balance from folio:
  //   positive charges (room rate, add-charge, extended stay) that are unpaid/pending
  //   negative charges (payments recorded as negative amount)
  const byBooking: Record<string, FolioLineForBalance[]> = {}
  for (const c of charges) {
    if (c.payment_status === 'posted_to_ledger') continue
    const bid = String((c as { booking_id?: string }).booking_id || '')
    if (!bid) continue
    if (!byBooking[bid]) byBooking[bid] = []
    byBooking[bid].push({
      amount: c.amount,
      charge_type: c.charge_type,
      payment_status: c.payment_status,
      payment_method: c.payment_method,
    })
  }

  let debt = 0
  let credit = 0
  for (const b of bookings) {
    const ch = byBooking[b.id] ?? []
    debt += Math.max(0, folioPositiveOutstandingSum(ch))
    credit += folioGuestCreditAmount(ch)
  }

  if (debt > 0.005) return debt
  if (credit > 0.005) return -credit

  // Folios clear — still surface city-ledger debit so Guest DB / owing alerts match
  const { data: guestRow } = await supabase
    .from('guests')
    .select('name')
    .eq('id', guestId)
    .maybeSingle()
  const guestName = String(guestRow?.name || '').trim()
  if (guestName) {
    const { data: ledgerRows } = await supabase
      .from('city_ledger_accounts')
      .select('balance, account_type')
      .eq('organization_id', organizationId)
      .in('account_type', ['individual', 'guest'])
      .ilike('account_name', guestName)
      .limit(20)
    const preferred = pickPreferredGuestLedgerAccount(ledgerRows || [])
    const led = Number(preferred?.balance ?? 0)
    if (led > 0.005) return led
    if (led < -0.005) return led
  }

  return 0
}

type GuestBalanceInput = string | { id: string; name?: string | null }

function normalizeGuestInputs(
  guestIdsOrGuests: GuestBalanceInput[],
): { id: string; name: string }[] {
  return guestIdsOrGuests.map((g) =>
    typeof g === 'string'
      ? { id: g, name: '' }
      : { id: g.id, name: String(g.name || '').trim() },
  )
}

/**
 * Batch-calculate balances for multiple guests in one set of queries.
 * Positive = still owes; negative = prepaid credit available.
 * When organizationId + guest names are provided, city-ledger credit is included.
 */
export async function calculateGuestBalancesBatch(
  supabase: any,
  guestIdsOrGuests: GuestBalanceInput[],
  organizationId?: string | null,
): Promise<Record<string, number>> {
  const guests = normalizeGuestInputs(guestIdsOrGuests)
  const guestIds = guests.map((g) => g.id)
  if (!guestIds.length) return {}

  const nameById: Record<string, string> = {}
  for (const g of guests) {
    if (g.name) nameById[g.id] = g.name
  }

  // Get all bookings for these guests (across all orgs, will check per guest later)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, guest_id, total_amount, deposit, balance, payment_status')
    .in('guest_id', guestIds)
    .not('status', 'in', '("cancelled")')

  const debtMap: Record<string, number> = Object.fromEntries(
    guestIds.map((id) => [id, 0]),
  )
  const creditMap: Record<string, number> = Object.fromEntries(
    guestIds.map((id) => [id, 0]),
  )

  if (!bookings || bookings.length === 0) {
    return await applyLedgerCreditsToBalanceMap(
      supabase,
      debtMap,
      creditMap,
      nameById,
      organizationId,
    )
  }

  // Get all folio charges for all these bookings in one query
  const { data: charges } = await supabase
    .from('folio_charges')
    .select('booking_id, amount, charge_type, payment_status, payment_method')
    .in(
      'booking_id',
      bookings.map((b: { id: string }) => b.id),
    )

  // Build a bookingId → guestId map
  const bookingToGuest: Record<string, string> = {}
  bookings.forEach((b: { id: string; guest_id: string }) => {
    bookingToGuest[b.id] = b.guest_id
  })

  if (!charges || charges.length === 0) {
    // Fall back: compute from booking totals
    bookings.forEach(
      (b: {
        guest_id: string
        payment_status?: string
        total_amount?: number
        deposit?: number
      }) => {
        const gId = b.guest_id
        if (b.payment_status !== 'paid') {
          const owed = Math.max(0, (b.total_amount || 0) - (b.deposit || 0))
          debtMap[gId] = (debtMap[gId] || 0) + owed
        }
      },
    )
    return await applyLedgerCreditsToBalanceMap(
      supabase,
      debtMap,
      creditMap,
      nameById,
      organizationId,
    )
  }

  const chargesByBooking: Record<string, FolioLineForBalance[]> = {}
  const postedToOrganizationLedger = new Set<string>()
  charges.forEach(
    (c: {
      booking_id: string
      payment_status?: string | null
      amount?: unknown
      charge_type?: string | null
      payment_method?: string | null
    }) => {
      if (c.payment_status === 'posted_to_ledger') {
        postedToOrganizationLedger.add(c.booking_id)
        return
      }
      if (!chargesByBooking[c.booking_id]) chargesByBooking[c.booking_id] = []
      chargesByBooking[c.booking_id].push({
        amount: c.amount,
        charge_type: c.charge_type,
        payment_status: c.payment_status,
        payment_method: c.payment_method,
      })
    },
  )

  bookings.forEach((b: { id: string; guest_id: string }) => {
    const gId = b.guest_id
    if (postedToOrganizationLedger.has(b.id)) return
    const ch = chargesByBooking[b.id] ?? []
    debtMap[gId] = (debtMap[gId] || 0) + Math.max(0, folioPositiveOutstandingSum(ch))
    creditMap[gId] = (creditMap[gId] || 0) + folioGuestCreditAmount(ch)
  })

  return await applyLedgerCreditsToBalanceMap(
    supabase,
    debtMap,
    creditMap,
    nameById,
    organizationId,
  )
}

async function applyLedgerCreditsToBalanceMap(
  supabase: any,
  debtMap: Record<string, number>,
  creditMap: Record<string, number>,
  nameById: Record<string, string>,
  organizationId?: string | null,
): Promise<Record<string, number>> {
  const balanceMap: Record<string, number> = {}
  const ledgerCreditByName = new Map<string, number>()
  const ledgerDebitByName = new Map<string, number>()

  const names = Object.values(nameById).filter(Boolean)
  if (organizationId && names.length > 0) {
    const { data: ledgerRows } = await supabase
      .from('city_ledger_accounts')
      .select('account_name, balance, account_type')
      .eq('organization_id', organizationId)
      .in('account_type', ['individual', 'guest'])
      .limit(2000)

    // Group by name — prefer largest prepaid credit (most negative)
    const byName: Record<string, { balance?: unknown }[]> = {}
    for (const row of ledgerRows || []) {
      const key = String(row.account_name || '')
        .trim()
        .toLowerCase()
      if (!key) continue
      if (!byName[key]) byName[key] = []
      byName[key].push(row)
    }
    for (const [key, rows] of Object.entries(byName)) {
      const preferred = pickPreferredGuestLedgerAccount(rows)
      const bal = Number(preferred?.balance ?? 0)
      if (bal < -0.005) {
        ledgerCreditByName.set(key, Math.abs(bal))
      } else if (bal > 0.005) {
        ledgerDebitByName.set(key, bal)
      }
    }
  }

  for (const id of Object.keys(debtMap)) {
    const debt = Math.max(0, debtMap[id] || 0)
    const folioCredit = Math.max(0, creditMap[id] || 0)
    const nameKey = String(nameById[id] || '')
      .trim()
      .toLowerCase()
    const ledgerCredit = nameKey ? ledgerCreditByName.get(nameKey) || 0 : 0
    const ledgerDebit = nameKey ? ledgerDebitByName.get(nameKey) || 0 : 0
    const credit = Math.max(folioCredit, ledgerCredit)

    if (debt > 0.005) {
      // Still owing on folio — show debt; credit is tracked on guest detail
      balanceMap[id] = debt
    } else if (ledgerDebit > 0.005) {
      // Folios clear but city ledger still has a debit (posted / legacy)
      balanceMap[id] = ledgerDebit
    } else if (credit > 0.005) {
      balanceMap[id] = -credit
    } else {
      balanceMap[id] = 0
    }
  }

  return balanceMap
}

/**
 * Batch-calculate balances for menu organizations (NGO / corp rows).
 * For each organization row we take max(organizations.current_balance, matching city ledger account balance).
 * City ledger rows are scoped per hotel tenant via organization_id + account_name matching the entity name.
 */
export async function calculateOrganizationBalancesBatch(
  supabase: any,
  menuOrganizationIds: string[],
  options?: { hotelTenantId?: string | null }
): Promise<Record<string, number>> {
  if (!menuOrganizationIds.length) return {}

  const balanceMap: Record<string, number> = Object.fromEntries(menuOrganizationIds.map(id => [id, 0]))
  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, current_balance')
    .in('id', menuOrganizationIds)

  const orgRows = organizations || []
  orgRows.forEach((org: any) => {
    balanceMap[org.id] = Number(org.current_balance || 0)
  })

  const names = orgRows.map((org: any) => org.name).filter(Boolean)
  if (names.length > 0) {
    let q = supabase
      .from('city_ledger_accounts')
      .select('account_name, balance')
      .in('account_name', names)
      .in('account_type', ['organization', 'corporate'])
    if (options?.hotelTenantId) {
      q = q.eq('organization_id', options.hotelTenantId)
    }
    const { data: ledgerAccounts } = await q

    ;(ledgerAccounts || []).forEach((account: any) => {
      const acctName = String(account.account_name || '').toLowerCase()
      const amt = Number(account.balance || 0)
      orgRows.forEach((org: any) => {
        if (String(org.name || '').toLowerCase() !== acctName) return
        balanceMap[org.id] = Math.max(balanceMap[org.id] || 0, amt)
      })
    })
  }

  return balanceMap
}

/** Format balance for display */
export function formatBalance(balance: number): string {
  return Math.abs(balance).toFixed(2)
}

/** Get balance status */
export function getBalanceStatus(balance: number): 'paid' | 'unpaid' | 'credit' {
  if (balance > 0) return 'unpaid'
  if (balance < 0) return 'credit'
  return 'paid'
}
