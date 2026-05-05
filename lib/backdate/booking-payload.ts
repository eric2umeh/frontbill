import type { SupabaseClient } from '@supabase/supabase-js'
import { applyPaymentToGuestCityLedger } from '@/lib/utils/guest-city-ledger'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'
import { formatPersonName } from '@/lib/utils/name-format'

export type SerializedBookingPayload = {
  organization_id: string
  guest: {
    guest_id: string | null
    full_name: string
    phone: string
    email: string | null
    address: string | null
  }
  check_in: string
  check_out: string
  nights: number
  room_id: string
  room_number: string
  price_per_night: number
  custom_price: number
  payment_method: string
  payment_status: 'paid' | 'partial'
  amount_paid: number
  pay_above_room_total: boolean
  ledger_account: string | null
  ledger_tab: 'individual' | 'organization'
  ledger_account_name: string
}

export type CreateBookingFromPayloadResult =
  | { ok: true; bookingId: string; folio_id: string }
  | { ok: false; error: string }

/**
 * Mirrors `NewBookingModal.handleSubmit` using the admin client (service role).
 */
export async function createBookingFromPayload(
  admin: SupabaseClient,
  payload: SerializedBookingPayload,
  createdByUserId: string,
): Promise<CreateBookingFromPayloadResult> {
  const {
    organization_id,
    guest,
    check_in,
    check_out,
    nights,
    room_id,
    room_number,
    price_per_night,
    custom_price,
    payment_method,
    payment_status,
    amount_paid: rawPaid,
    pay_above_room_total,
    ledger_account,
    ledger_tab,
    ledger_account_name,
  } = payload

  if (!organization_id || !guest?.full_name?.trim() || !room_id || !check_in || !check_out || nights < 1) {
    return { ok: false, error: 'Invalid booking payload' }
  }

  const formattedGuestName = formatPersonName(guest.full_name)
  const effectiveRate = custom_price > 0 ? custom_price : price_per_night
  const total = effectiveRate * nights
  const isCityLedger = payment_method === 'city_ledger'

  let paidAmount = 0
  if (!isCityLedger) {
    if (payment_status === 'paid') {
      paidAmount = pay_above_room_total ? Math.max(total, rawPaid || total) : total
    } else {
      paidAmount = pay_above_room_total ? Math.max(0, rawPaid) : Math.min(rawPaid, total)
    }
  }
  const balanceAmount = Math.max(0, total - paidAmount)

  if (!isCityLedger && payment_status === 'partial' && paidAmount <= 0) {
    return { ok: false, error: 'Partial payment requires an amount paid' }
  }
  if (isCityLedger && !ledger_account) {
    return { ok: false, error: 'City ledger booking missing ledger account id' }
  }

  const { data: overlaps, error: ovErr } = await admin
    .from('bookings')
    .select('id')
    .eq('room_id', room_id)
    .neq('status', 'cancelled')
    .lt('check_in', check_out)
    .gt('check_out', check_in)

  if (ovErr) return { ok: false, error: ovErr.message }
  if ((overlaps?.length ?? 0) > 0) {
    return { ok: false, error: 'Selected room is already booked for these dates' }
  }

  let finalGuestId = guest.guest_id

  if (!finalGuestId) {
    const { data: newGuest, error: ge } = await admin
      .from('guests')
      .insert([
        {
          organization_id,
          name: formattedGuestName,
          phone: guest.phone || '',
          email: guest.email || null,
          address: guest.address || null,
        },
      ])
      .select()
      .single()
    if (ge) return { ok: false, error: ge.message || 'Guest create failed' }
    finalGuestId = newGuest.id
  }

  const folioId = `FOL-${Date.now().toString(36).toUpperCase()}`
  const todayStr = new Date().toISOString().split('T')[0]

  const { data: booking, error: be } = await admin
    .from('bookings')
    .insert([
      {
        organization_id,
        guest_id: finalGuestId,
        room_id,
        folio_id: folioId,
        check_in,
        check_out,
        number_of_nights: nights,
        rate_per_night: effectiveRate,
        total_amount: total,
        deposit: paidAmount,
        balance: balanceAmount,
        payment_status: isCityLedger ? 'pending' : balanceAmount <= 0 ? 'paid' : 'partial',
        status: check_in > todayStr ? 'reserved' : 'confirmed',
        created_by: createdByUserId,
        notes:
          payment_method === 'city_ledger'
            ? `City Ledger: ${ledger_account_name || 'account'}`
            : `payment_method: ${payment_method}`,
      },
    ])
    .select()
    .single()

  if (be || !booking) return { ok: false, error: be?.message || 'Booking insert failed' }

  if (payment_method === 'city_ledger' && ledger_account) {
    const { data: acc } = await admin
      .from('city_ledger_accounts')
      .select('balance, account_type')
      .eq('id', ledger_account)
      .single()

    await admin
      .from('city_ledger_accounts')
      .update({ balance: (Number(acc?.balance) || 0) + total })
      .eq('id', ledger_account)

    const acctType = acc?.account_type || (ledger_tab === 'individual' ? 'individual' : 'organization')
    if (acctType === 'individual' || acctType === 'guest') {
      if (finalGuestId) {
        const { data: guestRow } = await admin.from('guests').select('balance').eq('id', finalGuestId).single()
        await admin
          .from('guests')
          .update({ balance: (Number(guestRow?.balance) || 0) + total })
          .eq('id', finalGuestId)
      }
    } else {
      const { data: orgRow } = await admin.from('organizations').select('current_balance').eq('id', ledger_account).single()
      if (orgRow) {
        await admin
          .from('organizations')
          .update({ current_balance: (Number(orgRow.current_balance) || 0) + total })
          .eq('id', ledger_account)
      }
    }
  }

  await admin
    .from('rooms')
    .update({ status: 'occupied', updated_by: createdByUserId, updated_at: new Date().toISOString() })
    .eq('id', room_id)

  const { error: folioInsertError } = await insertFolioCharges(admin, [
    {
      booking_id: booking.id,
      organization_id,
      description: `Initial booking charge - ${nights} night${nights !== 1 ? 's' : ''}`,
      amount: total,
      charge_type: 'room_charge',
      payment_method,
      ledger_account_id: ledger_account || null,
      ledger_account_type:
        payment_method === 'city_ledger' ? (ledger_tab === 'individual' ? 'individual' : 'organization') : null,
      payment_status: isCityLedger ? 'city_ledger' : balanceAmount <= 0 ? 'paid' : 'unpaid',
      created_by: createdByUserId,
    },
  ])
  if (folioInsertError) return { ok: false, error: folioInsertError.message }

  if (paidAmount > 0 && balanceAmount > 0) {
    const { error: payErr } = await insertFolioCharges(admin, [
      {
        booking_id: booking.id,
        organization_id,
        description: `Initial payment - ${payment_method}`,
        amount: -paidAmount,
        charge_type: 'payment',
        payment_method,
        payment_status: 'paid',
        created_by: createdByUserId,
      },
    ])
    if (payErr) return { ok: false, error: payErr.message }
  }

  await admin.from('transactions').insert([
    {
      organization_id,
      booking_id: booking.id,
      transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
      guest_name: formattedGuestName,
      room: room_number,
      amount: paidAmount || total,
      payment_method,
      status: balanceAmount <= 0 ? 'completed' : 'pending',
      description: `Booking created - Folio ${folioId}`,
      received_by: createdByUserId,
    },
  ])

  if (paidAmount > 0) {
    await admin.from('payments').insert([
      {
        organization_id,
        booking_id: booking.id,
        guest_id: finalGuestId,
        amount: paidAmount,
        payment_method,
        payment_date: new Date().toISOString(),
        notes: `Booking payment — Folio ${folioId}`,
      },
    ])
  }

  const prepayExcess = Math.max(0, paidAmount - total)
  if (!isCityLedger && prepayExcess > 0 && finalGuestId) {
    const { data: gRow } = await admin.from('guests').select('name').eq('id', finalGuestId).maybeSingle()
    const ledgerName = (gRow?.name || formattedGuestName).trim()
    if (ledgerName) {
      await applyPaymentToGuestCityLedger(admin, {
        organizationId: organization_id,
        guestName: ledgerName,
        paymentAmount: prepayExcess,
        createIfMissingExcess: prepayExcess,
      })
    }
  }

  return { ok: true, bookingId: booking.id, folio_id: folioId }
}
