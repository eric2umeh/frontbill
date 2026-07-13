import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eligibleCashbackPaymentBaseFromFolioRows,
  earnedPaymentBaseFromCashbackTransactions,
  remainingCashbackEarnPaymentBase,
} from "../lib/cashback/earn-source-verification";

describe("cashback earn source verification", () => {
  it("counts only posted cash payment rows for the requested method", () => {
    const eligible = eligibleCashbackPaymentBaseFromFolioRows(
      [
        { amount: 20000, charge_type: "room_charge", payment_method: "pos" },
        { amount: -12000, charge_type: "payment", payment_method: "pos" },
        { amount: -5000, charge_type: "payment", payment_method: "transfer" },
        { amount: -3000, charge_type: "payment", payment_method: "cashback" },
      ],
      "pos",
    );

    assert.equal(eligible, 12000);
  });

  it("subtracts previous earn transactions for the same source", () => {
    const remaining = remainingCashbackEarnPaymentBase({
      folioRows: [
        { amount: -25000, charge_type: "payment", payment_method: "cash" },
      ],
      cashbackTransactions: [
        { amount: 1000, earn_rate_percent: 5 },
      ],
      paymentMethod: "cash",
    });

    assert.equal(remaining, 5000);
  });

  it("fails closed when prior earn rows lack the rate needed to recover payment base", () => {
    const earnedBase = earnedPaymentBaseFromCashbackTransactions([
      { amount: 1000, earn_rate_percent: null },
    ]);

    assert.equal(earnedBase, Number.POSITIVE_INFINITY);
    assert.equal(
      remainingCashbackEarnPaymentBase({
        folioRows: [
          { amount: -25000, charge_type: "payment", payment_method: "cash" },
        ],
        cashbackTransactions: [{ amount: 1000, earn_rate_percent: null }],
        paymentMethod: "cash",
      }),
      0,
    );
  });
});
