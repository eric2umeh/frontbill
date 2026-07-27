/**
 * Bulk individual cashback is loaded from the Step-1 contact guest.
 * Only redeem/earn against a room guest when it is that same guest —
 * otherwise discounts computed from Guest A would debit Guest B (or fail mid-loop).
 */
export function bulkRoomUsesStep1Cashback(args: {
  cashbackEligible: boolean
  step1GuestId: string | null | undefined
  roomGuestId: string | null | undefined
}): boolean {
  const step1 = typeof args.step1GuestId === 'string' ? args.step1GuestId.trim() : ''
  const room = typeof args.roomGuestId === 'string' ? args.roomGuestId.trim() : ''
  return Boolean(args.cashbackEligible && step1 && room && step1 === room)
}
