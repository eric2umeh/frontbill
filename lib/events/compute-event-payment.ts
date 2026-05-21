export type EventPaymentStatus = 'paid' | 'partial' | 'unpaid'

export type EventPaymentInput = {
  totalAmount: number
  paymentStatus: EventPaymentStatus
  partialAmount: number
  payAboveTotal: boolean
}

export type EventPaymentBreakdown = {
  depositAmount: number
  balanceAmount: number
  storedPaymentStatus: 'paid' | 'partial' | 'pending'
}

export function computeEventPayment(input: EventPaymentInput): EventPaymentBreakdown {
  const total = Math.max(0, Number(input.totalAmount) || 0)
  const rawPaid = Math.max(0, Number(input.partialAmount) || 0)

  let depositAmount = 0
  if (input.paymentStatus === 'paid') {
    depositAmount = input.payAboveTotal
      ? Math.max(total, rawPaid || total)
      : total
  } else if (input.paymentStatus === 'partial') {
    depositAmount = input.payAboveTotal
      ? Math.max(0, rawPaid)
      : Math.min(rawPaid, total)
  }

  depositAmount = Math.round(depositAmount * 100) / 100
  const balanceAmount = Math.round(Math.max(0, total - depositAmount) * 100) / 100

  const storedPaymentStatus: EventPaymentBreakdown['storedPaymentStatus'] =
    balanceAmount <= 0 && depositAmount > 0
      ? 'paid'
      : depositAmount > 0
        ? 'partial'
        : 'pending'

  return { depositAmount, balanceAmount, storedPaymentStatus }
}
