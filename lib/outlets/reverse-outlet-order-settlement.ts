import type { SupabaseClient } from '@supabase/supabase-js'
import {
  outletTransactionId,
  buildOutletSettlementNotes,
} from '@/lib/outlets/outlet-financial-integration'
import { getOutletDepartment } from '@/lib/outlets/departments'

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function isCityLedgerMethod(method: string | null | undefined): boolean {
  const m = String(method || '').toLowerCase()
  return m === 'city_ledger' || m === 'room_charge'
}

async function reverseFolioCharge(
  admin: SupabaseClient,
  folioChargeId: string,
  bookingId: string,
  paymentMethod: string,
): Promise<void> {
  const { data: fc } = await admin
    .from('folio_charges')
    .select('amount, payment_status')
    .eq('id', folioChargeId)
    .maybeSingle()

  if (!fc) {
    await admin.from('folio_charges').delete().eq('id', folioChargeId)
    return
  }

  const amount = Number(fc.amount) || 0
  await admin.from('folio_charges').delete().eq('id', folioChargeId)

  const { data: bk } = await admin
    .from('bookings')
    .select('balance')
    .eq('id', bookingId)
    .maybeSingle()
  const balance = Number(bk?.balance) || 0
  const wasPaid = String(fc.payment_status || '').toLowerCase() === 'paid'
  const method = String(paymentMethod || '').toLowerCase()

  let newBalance = balance
  if (wasPaid && !isCityLedgerMethod(method)) {
    newBalance = roundMoney(balance + amount)
  } else {
    newBalance = Math.max(0, roundMoney(balance - amount))
  }

  await admin.from('bookings').update({ balance: newBalance }).eq('id', bookingId)
}

async function reverseCityLedgerBalances(
  admin: SupabaseClient,
  input: {
    organizationId: string
    ledgerAccountId: string
    bookingId: string | null
    amount: number
  },
): Promise<void> {
  const { data: acct } = await admin
    .from('city_ledger_accounts')
    .select('id, balance, account_type')
    .eq('id', input.ledgerAccountId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (acct) {
    const newBal = Math.max(0, roundMoney((Number(acct.balance) || 0) - input.amount))
    await admin
      .from('city_ledger_accounts')
      .update({ balance: newBal, updated_at: new Date().toISOString() })
      .eq('id', acct.id)

    if (acct.account_type === 'organization') {
      const { data: orgRow } = await admin
        .from('organizations')
        .select('current_balance')
        .eq('id', acct.id)
        .maybeSingle()
      if (orgRow) {
        await admin
          .from('organizations')
          .update({
            current_balance: Math.max(
              0,
              roundMoney((Number(orgRow.current_balance) || 0) - input.amount),
            ),
          })
          .eq('id', acct.id)
      }
    }
  }

  if (input.bookingId) {
    const { data: bk } = await admin
      .from('bookings')
      .select('guest_id')
      .eq('id', input.bookingId)
      .maybeSingle()
    const guestId = bk?.guest_id
    if (guestId) {
      const { data: guestRow } = await admin
        .from('guests')
        .select('balance')
        .eq('id', guestId)
        .maybeSingle()
      if (guestRow) {
        await admin
          .from('guests')
          .update({
            balance: Math.max(0, roundMoney((Number(guestRow.balance) || 0) - input.amount)),
          })
          .eq('id', guestId)
      }
    }
  }
}

/**
 * Undo financial side effects from a settled outlet order (folio, ledger, payments, transactions).
 * Call before marking the order status as void.
 */
export async function reverseOutletOrderSettlement(
  admin: SupabaseClient,
  input: {
    organizationId: string
    order: {
      id: string
      order_number: string
      department: string
      subtotal: number | string
      payment_method: string | null
      booking_id: string | null
      folio_charge_id: string | null
      city_ledger_account_id?: string | null
      payment_id?: string | null
      is_complimentary?: boolean | null
      outlet_order_lines?: Array<{ item_name: string; qty: number }> | null
    }
    voidReason: string
  },
): Promise<void> {
  const complimentary = !!input.order.is_complimentary
  const amount = complimentary ? 0 : Math.max(0, Number(input.order.subtotal) || 0)
  const paymentMethod = String(input.order.payment_method || '')
  const orderNumber = String(input.order.order_number)
  const txId = outletTransactionId(orderNumber)

  if (input.order.folio_charge_id && input.order.booking_id) {
    await reverseFolioCharge(
      admin,
      input.order.folio_charge_id,
      input.order.booking_id,
      paymentMethod,
    )
  }

  if (amount > 0 && isCityLedgerMethod(paymentMethod) && input.order.city_ledger_account_id) {
    await reverseCityLedgerBalances(admin, {
      organizationId: input.organizationId,
      ledgerAccountId: input.order.city_ledger_account_id,
      bookingId: input.order.booking_id,
      amount,
    })
  }

  await admin
    .from('transactions')
    .update({
      status: 'void',
      description: `VOID: ${input.voidReason}`.slice(0, 500),
    })
    .eq('organization_id', input.organizationId)
    .eq('transaction_id', txId)

  if (input.order.payment_id) {
    await admin.from('payments').delete().eq('id', input.order.payment_id)
    await admin
      .from('outlet_orders')
      .update({ payment_id: null })
      .eq('id', input.order.id)
  } else if (amount > 0 && !isCityLedgerMethod(paymentMethod)) {
    const dept = getOutletDepartment(input.order.department)
    const label = dept?.label ?? input.order.department
    const lines = input.order.outlet_order_lines ?? []
    const lineDetail = lines.map((l) => `${l.item_name} ×${l.qty}`).join(', ')
    const notes = buildOutletSettlementNotes(label, orderNumber, lineDetail || 'Outlet order')
    await admin
      .from('payments')
      .delete()
      .eq('organization_id', input.organizationId)
      .eq('notes', notes)
  }
}
