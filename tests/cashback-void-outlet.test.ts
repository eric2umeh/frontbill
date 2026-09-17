import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateCashbackEarnAmount } from "@/lib/cashback/cashback-config";
import {
  OUTLET_SETTLEMENT_CASHBACK_SOURCE,
  cashbackVoidSourceType,
  groupEarnAmountsByGuest,
  nextCashbackTotalsAfterEarnVoid,
  shouldReverseCashbackEarns,
} from "@/lib/cashback/reverse-cashback-earn";

describe("cashback void of outlet settlement", () => {
  it("names the void source so a second void is a no-op", () => {
    assert.equal(OUTLET_SETTLEMENT_CASHBACK_SOURCE, "outlet_settlement");
    assert.equal(
      cashbackVoidSourceType(OUTLET_SETTLEMENT_CASHBACK_SOURCE),
      "outlet_settlement_void",
    );
  });

  it("claws back the 2% earn from a voided ₦50,000 cash sale", () => {
    const earned = calculateCashbackEarnAmount(50_000, 2);
    assert.equal(earned, 1_000);
    const next = nextCashbackTotalsAfterEarnVoid(
      { earned: 1_000, balance: 1_000 },
      earned,
    );
    assert.equal(next.earnedTotal, 0);
    assert.equal(next.balance, 0);
  });

  it("does not drive balances negative if the guest already spent the award", () => {
    const next = nextCashbackTotalsAfterEarnVoid(
      { earned: 1_000, balance: 200 },
      1_000,
    );
    assert.equal(next.earnedTotal, 0);
    assert.equal(next.balance, 0);
  });

  it("groups multiple earn rows for the same guest", () => {
    const grouped = groupEarnAmountsByGuest([
      { guest_id: "g1", amount: 600 },
      { guest_id: "g1", amount: 400 },
      { guest_id: "g2", amount: 250 },
      { guest_id: "  ", amount: 99 },
      { guest_id: "g3", amount: 0 },
    ]);
    assert.deepEqual(grouped, [
      { guestId: "g1", amount: 1_000 },
      { guestId: "g2", amount: 250 },
    ]);
  });

  it("skips reverse when there was no earn or it was already clawed back", () => {
    assert.equal(
      shouldReverseCashbackEarns({ earnCount: 0, alreadyReversed: false }),
      false,
    );
    assert.equal(
      shouldReverseCashbackEarns({ earnCount: 1, alreadyReversed: true }),
      false,
    );
    assert.equal(
      shouldReverseCashbackEarns({ earnCount: 1, alreadyReversed: false }),
      true,
    );
  });

  it("leaves unrelated guest cashback intact when voiding one order", () => {
    const guestA = nextCashbackTotalsAfterEarnVoid(
      { earned: 1_500, balance: 1_500 },
      1_000,
    );
    assert.equal(guestA.earnedTotal, 500);
    assert.equal(guestA.balance, 500);
  });
});
