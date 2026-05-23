import type { SupabaseClient } from '@supabase/supabase-js'
import type { RevenueDepartment } from '@/lib/reports/revenue-category'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'

export type PostOutletCityLedgerParams = {
  organizationId: string
  userId: string
  departmentLabel: string
  revenueCategory: RevenueDepartment
  amount: number
  lineDetail: string
  orderNumber: string
  bookingId?: string | null
  ledgerAccountId?: string | null
  guestName?: string | null
  roomNumber?: string | null
  /** When an open bill already created a pending folio line, skip inserting another. */
  skipFolioInsert?: boolean
}

export type PostOutletCityLedgerResult = {
  folioChargeId: string | null
  ledgerAccountId: string
  ledgerAccountName: string
  fullDescription: string
}

type MaybeRelated<T> = T | T[] | null | undefined

type BookingLookupRow = {
  guest_id?: string | null
  balance?: number | string | null
  guests?: MaybeRelated<{ name?: string | null }>
  rooms?: MaybeRelated<{ room_number?: string | null }>
}

function firstRelated<T>(value: MaybeRelated<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Post outlet sale to city ledger (same pattern as folio "City Ledger" charges).
 * Description is prefixed with outlet name (e.g. "Restaurant — …") for reporting across the app.
 */
export async function postOutletCityLedgerCharge(
  supabase: SupabaseClient,
  params: PostOutletCityLedgerParams,
): Promise<PostOutletCityLedgerResult> {
  const {
    organizationId,
    userId,
    departmentLabel,
    revenueCategory,
    amount,
    lineDetail,
    orderNumber,
    bookingId,
    ledgerAccountId: presetLedgerId,
    guestName,
    roomNumber,
    skipFolioInsert = false,
  } = params

  if (amount <= 0) throw new Error('Amount must be positive')

  const fullDescription = `${departmentLabel} — ${lineDetail}`.slice(0, 500)
  const txDescription = `${departmentLabel} — ${orderNumber} — ${lineDetail}`.slice(0, 500)

  let folioChargeId: string | null = null
  let guestId: string | null = null
  let resolvedGuestName = guestName?.trim() || ''
  let bookingRow: BookingLookupRow | null = null
  let presetLedger: {
    id: string
    account_name: string
    balance?: number | string | null
    account_type?: string | null
  } | null = null
  let existingGuestLedger: {
    id: string
    account_name: string
    balance?: number | string | null
  } | null = null

  if (bookingId) {
    const { data: bk, error: be } = await supabase
      .from('bookings')
      .select('id, guest_id, balance, payment_status, guests(name), rooms(room_number)')
      .eq('id', bookingId)
      .eq('organization_id', organizationId)
      .single()

    if (be || !bk) throw new Error('Booking not found')

    const row = bk as BookingLookupRow
    bookingRow = row
    guestId = row.guest_id ?? null
    const g = firstRelated(row.guests)
    if (g?.name) resolvedGuestName = g.name
  }

  if (presetLedgerId) {
    const { data: acct, error: acctErr } = await supabase
      .from('city_ledger_accounts')
      .select('id, account_name, balance, account_type')
      .eq('id', presetLedgerId)
      .eq('organization_id', organizationId)
      .single()
    if (acctErr || !acct) throw new Error('City ledger account not found')
    presetLedger = acct
  } else if (resolvedGuestName) {
    const { data: existing } = await supabase
      .from('city_ledger_accounts')
      .select('id, account_name, balance')
      .eq('organization_id', organizationId)
      .ilike('account_name', resolvedGuestName)
      .in('account_type', ['individual', 'guest'])
      .maybeSingle()

    existingGuestLedger = existing ?? null
  } else {
    throw new Error('Guest name, room number with active check-in, or city ledger account is required')
  }

  if (bookingId && bookingRow && !skipFolioInsert) {
    const { error: fcErr } = await insertFolioCharges(supabase, [
      {
        booking_id: bookingId,
        organization_id: organizationId,
        description: fullDescription,
        amount,
        charge_type: 'additional_charge',
        payment_method: 'city_ledger',
        payment_status: 'pending',
        revenue_category: revenueCategory,
        created_by: userId,
      },
    ])
    if (fcErr) throw new Error(fcErr.message)

    const { data: fcRows, error: fcIdErr } = await supabase
      .from('folio_charges')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('description', fullDescription)
      .order('created_at', { ascending: false })
      .limit(1)
    if (fcIdErr) throw new Error(fcIdErr.message)
    folioChargeId = fcRows?.[0]?.id ?? null

    const newBalance = (Number(bookingRow.balance) || 0) + amount
    await supabase
      .from('bookings')
      .update({ balance: newBalance, payment_status: 'pending' })
      .eq('id', bookingId)
  }

  let ledgerAccountId = presetLedger?.id ?? null
  let ledgerAccountName = ''

  if (presetLedger) {
    ledgerAccountName = presetLedger.account_name
    const newBal = (Number(presetLedger.balance) || 0) + amount
    await supabase
      .from('city_ledger_accounts')
      .update({ balance: newBal, updated_at: new Date().toISOString() })
      .eq('id', presetLedger.id)
    if (presetLedger.account_type === 'organization') {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('current_balance')
        .eq('id', presetLedger.id)
        .maybeSingle()
      if (orgRow) {
        await supabase
          .from('organizations')
          .update({ current_balance: (Number(orgRow.current_balance) || 0) + amount })
          .eq('id', presetLedger.id)
      }
    }
  } else if (resolvedGuestName) {
    if (existingGuestLedger) {
      ledgerAccountId = existingGuestLedger.id
      ledgerAccountName = existingGuestLedger.account_name
      await supabase
        .from('city_ledger_accounts')
        .update({
          balance: (Number(existingGuestLedger.balance) || 0) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingGuestLedger.id)
    } else {
      const { data: created, error: ce } = await supabase
        .from('city_ledger_accounts')
        .insert([
          {
            organization_id: organizationId,
            account_name: resolvedGuestName,
            account_type: 'individual',
            balance: amount,
          },
        ])
        .select('id, account_name')
        .single()
      if (ce) throw new Error(ce.message)
      ledgerAccountId = created!.id
      ledgerAccountName = created!.account_name
    }
  }

  if (guestId) {
    const { data: guestRow } = await supabase
      .from('guests')
      .select('balance')
      .eq('id', guestId)
      .maybeSingle()
    if (guestRow) {
      await supabase
        .from('guests')
        .update({ balance: (Number(guestRow.balance) || 0) + amount })
        .eq('id', guestId)
    }
  }

  await supabase.from('transactions').insert([
    {
      organization_id: organizationId,
      booking_id: bookingId || null,
      transaction_id: `OUT-${orderNumber}`,
      guest_name: ledgerAccountName || resolvedGuestName || 'Guest',
      room: roomNumber?.trim() || null,
      amount,
      payment_method: 'city_ledger',
      category: 'city_ledger',
      status: 'pending',
      description: txDescription,
      received_by: userId,
    },
  ])

  return {
    folioChargeId,
    ledgerAccountId: ledgerAccountId!,
    ledgerAccountName,
    fullDescription,
  }
}
