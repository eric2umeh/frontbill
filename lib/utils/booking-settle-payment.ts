/**
 * Booking Settle/Top Up can prefill guest-wide debt (other stays / city ledger)
 * while Record Payment historically posted only onto the open booking folio.
 */

export function guestWideSettleDue(snapshot: {
  balance?: number | null;
  dueBalance?: number | null;
}): number {
  const led = Number(snapshot.balance) || 0;
  const due = Number(snapshot.dueBalance) || 0;
  return Math.max(0, led > 0 ? led : 0, due > 0 ? due : 0);
}

export type BookingSettlePaymentPlan =
  | { ok: true; mode: "this-booking" | "guest-wide"; collectCap: number }
  | { ok: false; error: string };

/**
 * Decide whether cash should hit only this folio or settle the guest’s
 * open folios (same path as guest-profile Settle / Top Up).
 *
 * Guest-wide mode when the amount exceeds this booking’s bill and the guest
 * still owes on other stays / ledger. Excess above that cap still requires
 * the “Paying above bill” checkbox.
 */
export function planBookingSettlePayment(input: {
  thisBookingDue: number;
  guestWideDue: number;
  cashEntered: number;
  allowOverpayment: boolean;
}): BookingSettlePaymentPlan {
  const thisDue = Math.max(0, Number(input.thisBookingDue) || 0);
  const guestDue = Math.max(0, Number(input.guestWideDue) || 0);
  const cash = Math.max(0, Number(input.cashEntered) || 0);
  const collectCap = Math.max(thisDue, guestDue);

  if (cash <= 0) {
    return { ok: false, error: "Please enter a valid amount" };
  }

  if (cash > collectCap + 0.001 && !input.allowOverpayment) {
    return {
      ok: false,
      error:
        guestDue > thisDue + 0.005
          ? "This amount is more than the guest's outstanding balance. Enable “Paying above bill” for excess credit, or reduce the amount."
          : "This amount is more than the current bill balance. Enable “Paying above bill — apply excess as account credit” or reduce the amount.",
    };
  }

  const mode: "this-booking" | "guest-wide" =
    cash > thisDue + 0.005 && guestDue > thisDue + 0.005
      ? "guest-wide"
      : "this-booking";

  return { ok: true, mode, collectCap };
}
