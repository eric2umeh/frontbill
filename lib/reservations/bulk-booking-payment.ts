export type BulkPaymentStatus = 'paid' | 'partial' | 'unpaid'

export type BulkBookingPaymentAmounts = {
  depositAmount: number
  balanceAmount: number
  bookingPaymentStatus: 'paid' | 'partial' | 'pending'
  folioChargePaymentStatus: 'paid' | 'unpaid'
  transactionStatus: 'paid' | 'partial' | 'pending'
  prepayExcess: number
}

type ResolveBulkBookingPaymentInput = {
  totalAmount: number
  paymentStatus: BulkPaymentStatus
  partialAmount: number | ''
  payAboveRoomTotal: boolean
  pendingHold: boolean
}

export function resolveBulkBookingPayment({
  totalAmount,
  paymentStatus,
  partialAmount,
  payAboveRoomTotal,
  pendingHold,
}: ResolveBulkBookingPaymentInput): BulkBookingPaymentAmounts {
  const paidInput = Number(partialAmount) || 0
  const depositAmount = pendingHold
    ? 0
    : paymentStatus === 'paid'
      ? payAboveRoomTotal
        ? Math.max(totalAmount, paidInput || totalAmount)
        : totalAmount
      : paymentStatus === 'partial'
        ? paidInput
        : 0
  const balanceAmount = Math.max(0, totalAmount - depositAmount)
  const bookingPaymentStatus = pendingHold
    ? 'pending'
    : paymentStatus === 'paid'
      ? 'paid'
      : paymentStatus === 'partial'
        ? 'partial'
        : 'pending'

  return {
    depositAmount,
    balanceAmount,
    bookingPaymentStatus,
    folioChargePaymentStatus: balanceAmount > 0 ? 'unpaid' : 'paid',
    transactionStatus: bookingPaymentStatus,
    prepayExcess: Math.max(0, depositAmount - totalAmount),
  }
}
