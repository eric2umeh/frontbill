import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  guestWideSettleDue,
  planBookingSettlePayment,
} from "../lib/utils/booking-settle-payment";

describe("guestWideSettleDue", () => {
  it("takes the larger of positive display balance and folio due", () => {
    assert.equal(
      guestWideSettleDue({ balance: 50_000, dueBalance: 80_000 }),
      80_000,
    );
    assert.equal(
      guestWideSettleDue({ balance: 80_000, dueBalance: 50_000 }),
      80_000,
    );
  });

  it("ignores prepaid credit when computing amount to collect", () => {
    assert.equal(
      guestWideSettleDue({ balance: -20_000, dueBalance: 15_000 }),
      15_000,
    );
    assert.equal(
      guestWideSettleDue({ balance: -20_000, dueBalance: 0 }),
      0,
    );
  });
});

describe("planBookingSettlePayment", () => {
  it("keeps a same-stay payment on this booking folio", () => {
    const plan = planBookingSettlePayment({
      thisBookingDue: 50_000,
      guestWideDue: 50_000,
      cashEntered: 50_000,
      allowOverpayment: false,
    });
    assert.equal(plan.ok, true);
    if (plan.ok) assert.equal(plan.mode, "this-booking");
  });

  it("routes guest-wide prefill onto account-wide settlement without the overpay checkbox", () => {
    // In-house stay 20k; older stay still owes 60k. Settle prefills 80k.
    const plan = planBookingSettlePayment({
      thisBookingDue: 20_000,
      guestWideDue: 80_000,
      cashEntered: 80_000,
      allowOverpayment: false,
    });
    assert.equal(plan.ok, true);
    if (plan.ok) {
      assert.equal(plan.mode, "guest-wide");
      assert.equal(plan.collectCap, 80_000);
    }
  });

  it("still posts only this folio when staff reduces the amount to this bill", () => {
    const plan = planBookingSettlePayment({
      thisBookingDue: 20_000,
      guestWideDue: 80_000,
      cashEntered: 20_000,
      allowOverpayment: false,
    });
    assert.equal(plan.ok, true);
    if (plan.ok) assert.equal(plan.mode, "this-booking");
  });

  it("settles other stays when this booking is already paid", () => {
    const plan = planBookingSettlePayment({
      thisBookingDue: 0,
      guestWideDue: 80_000,
      cashEntered: 80_000,
      allowOverpayment: false,
    });
    assert.equal(plan.ok, true);
    if (plan.ok) assert.equal(plan.mode, "guest-wide");
  });

  it("rejects cash above guest-wide due unless overpayment is enabled", () => {
    const blocked = planBookingSettlePayment({
      thisBookingDue: 20_000,
      guestWideDue: 80_000,
      cashEntered: 100_000,
      allowOverpayment: false,
    });
    assert.equal(blocked.ok, false);

    const allowed = planBookingSettlePayment({
      thisBookingDue: 20_000,
      guestWideDue: 80_000,
      cashEntered: 100_000,
      allowOverpayment: true,
    });
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(allowed.mode, "guest-wide");
  });

  it("rejects overpay on a single-stay bill unless the checkbox is on", () => {
    const blocked = planBookingSettlePayment({
      thisBookingDue: 50_000,
      guestWideDue: 50_000,
      cashEntered: 70_000,
      allowOverpayment: false,
    });
    assert.equal(blocked.ok, false);

    const allowed = planBookingSettlePayment({
      thisBookingDue: 50_000,
      guestWideDue: 50_000,
      cashEntered: 70_000,
      allowOverpayment: true,
    });
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(allowed.mode, "this-booking");
  });
});
