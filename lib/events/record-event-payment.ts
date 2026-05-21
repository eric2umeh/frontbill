import type { SupabaseClient } from '@supabase/supabase-js'
import { computeEventPayment, type EventPaymentStatus } from '@/lib/events/compute-event-payment'
import { isEventPendingHold } from '@/lib/events/event-payment-methods'
import { applyPaymentToGuestCityLedger } from '@/lib/utils/guest-city-ledger'

export function parseEventPaymentFromBody(
  body: Record<string, unknown>,
  estimatedValue: number | null,
) {
  const total = Math.max(0, Number(estimatedValue) || 0)
  const rawMethod = String(body.payment_method || 'pos').trim().toLowerCase() || 'pos'
  const methodIsPendingHold = isEventPendingHold(rawMethod)

  let uiStatus = String(body.payment_status || 'paid').toLowerCase() as EventPaymentStatus
  if (methodIsPendingHold) uiStatus = 'unpaid'

  const paymentStatus: EventPaymentStatus =
    uiStatus === 'partial' || uiStatus === 'unpaid' ? uiStatus : 'paid'
  const partialAmount = methodIsPendingHold
    ? 0
    : body.partial_amount != null && body.partial_amount !== ''
      ? Math.max(0, Number(body.partial_amount) || 0)
      : 0
  const payAboveTotal = methodIsPendingHold ? false : Boolean(body.pay_above_total)

  const { depositAmount, balanceAmount, storedPaymentStatus } = computeEventPayment({
    totalAmount: total,
    paymentStatus,
    partialAmount,
    payAboveTotal,
  })

  const payment_method = methodIsPendingHold ? 'pending' : rawMethod
  const remarks =
    body.remarks != null ? String(body.remarks).trim() || null : null

  return {
    payment_method,
    payment_status: storedPaymentStatus,
    amount_paid: depositAmount,
    balance: balanceAmount,
    remarks,
    depositAmount,
    uiPaymentStatus: paymentStatus,
  }
}

export async function recordEventPaymentSideEffects(
  admin: SupabaseClient,
  input: {
    organizationId: string
    userId: string
    eventId: string
    title: string
    clientName: string | null
    venue: string | null
    guestId?: string | null
    estimatedValue: number | null
    paymentMethod: string
    storedPaymentStatus: string
    depositAmount: number
    balanceAmount: number
  },
): Promise<{ error: string | null }> {
  const total = Math.max(0, Number(input.estimatedValue) || 0)
  const { depositAmount, balanceAmount, paymentMethod, storedPaymentStatus } = input
  const clientName = (input.clientName || 'Event client').trim()

  if (isEventPendingHold(paymentMethod) || storedPaymentStatus === 'pending') {
    return { error: null }
  }

  if (depositAmount > 0) {
    const { error: payErr } = await admin.from('payments').insert({
      organization_id: input.organizationId,
      booking_id: null,
      guest_id: input.guestId || null,
      amount: depositAmount,
      payment_method: paymentMethod,
      payment_date: new Date().toISOString(),
      notes: `Event payment — ${input.title} (${input.eventId})`,
      received_by: input.userId,
    })
    if (payErr) return { error: payErr.message }
  }

  if (depositAmount > 0 || total > 0) {
    const { error: txnErr } = await admin.from('transactions').insert({
      organization_id: input.organizationId,
      booking_id: null,
      transaction_id: `EVT-${Date.now().toString(36).toUpperCase()}`,
      guest_name: clientName,
      room: input.venue,
      amount: depositAmount > 0 ? depositAmount : total,
      payment_method: paymentMethod,
      status: storedPaymentStatus,
      description: `Event — ${input.title}`,
      received_by: input.userId,
    })
    if (txnErr) return { error: txnErr.message }
  }

  const prepayExcess = Math.round(Math.max(0, depositAmount - total) * 100) / 100
  if (prepayExcess > 0 && clientName) {
    try {
      await applyPaymentToGuestCityLedger(admin, {
        organizationId: input.organizationId,
        guestName: clientName,
        paymentAmount: prepayExcess,
        createIfMissingExcess: prepayExcess,
      })
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'City ledger credit failed' }
    }
  }

  return { error: null }
}
