import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCashbackDiscount } from "../lib/cashback/cashback-payment-math";
import { recordPaymentApplication } from "../lib/booking/record-payment-overpay";
import { nextLedgerBalanceAfterBookingPayment } from "../lib/utils/guest-city-ledger";

describe("recordPaymentApplication overpay-as-credit", () => {
  it("drops excess when the checkbox is off (legacy cap)", () => {
    const bill = 10_000;
    const cashEntered = 15_000;
    const breakdown = computeCashbackDiscount({
      totalDue: bill,
      cashbackBalance: 0,
      cashPaying: cashEntered,
      applyCashback: false,
    });
    const app = recordPaymentApplication({
      cashEntered,
      cashbackDiscount: breakdown.cashbackDiscount,
      dueAfterDiscount: breakdown.dueAfterDiscount,
      applyOverpaymentAsCredit: false,
    });
    assert.equal(app.cashToCollect, 10_000);
    assert.equal(app.totalAppliedToBill, 10_000);
    assert.equal(app.excessCredit, 0);
    assert.equal(app.ledgerPaymentAmount, 10_000);
    assert.equal(app.transactionAmount, 10_000);
  });

  it("posts ₦5,000 city-ledger credit when ₦15,000 is taken on a ₦10,000 bill", () => {
    const bill = 10_000;
    const cashEntered = 15_000;
    const breakdown = computeCashbackDiscount({
      totalDue: bill,
      cashbackBalance: 0,
      cashPaying: cashEntered,
      applyCashback: false,
    });
    const app = recordPaymentApplication({
      cashEntered,
      cashbackDiscount: breakdown.cashbackDiscount,
      dueAfterDiscount: breakdown.dueAfterDiscount,
      applyOverpaymentAsCredit: true,
    });
    assert.equal(breakdown.cashToCollect, 10_000, "discount helper still caps collect");
    assert.equal(app.cashToCollect, 10_000);
    assert.equal(app.totalAppliedToBill, 10_000);
    assert.equal(app.excessCredit, 5_000);
    assert.equal(app.ledgerPaymentAmount, 15_000);
    assert.equal(app.transactionAmount, 15_000);

    const cappedLedger = nextLedgerBalanceAfterBookingPayment({
      ledgerBalance: 0,
      bookingBillBefore: bill,
      paymentAmount: app.totalAppliedToBill,
    });
    assert.equal(cappedLedger, 0, "passing only the capped bill amount stores no credit");

    const fixedLedger = nextLedgerBalanceAfterBookingPayment({
      ledgerBalance: 0,
      bookingBillBefore: bill,
      paymentAmount: app.ledgerPaymentAmount,
    });
    assert.equal(fixedLedger, -5_000);
  });

  it("keeps exact bill payments unchanged", () => {
    const breakdown = computeCashbackDiscount({
      totalDue: 40_000,
      cashbackBalance: 0,
      cashPaying: 40_000,
      applyCashback: false,
    });
    const app = recordPaymentApplication({
      cashEntered: 40_000,
      cashbackDiscount: breakdown.cashbackDiscount,
      dueAfterDiscount: breakdown.dueAfterDiscount,
      applyOverpaymentAsCredit: true,
    });
    assert.equal(app.excessCredit, 0);
    assert.equal(app.ledgerPaymentAmount, 40_000);
    assert.equal(app.transactionAmount, 40_000);
    assert.equal(
      nextLedgerBalanceAfterBookingPayment({
        ledgerBalance: 0,
        bookingBillBefore: 40_000,
        paymentAmount: app.ledgerPaymentAmount,
      }),
      0,
    );
  });

  it("adds overpay on top of cashback discount without eating the discount", () => {
    const bill = 10_000;
    const cashEntered = 12_000;
    const breakdown = computeCashbackDiscount({
      totalDue: bill,
      cashbackBalance: 2_000,
      cashPaying: cashEntered,
      applyCashback: true,
    });
    assert.equal(breakdown.cashbackDiscount, 2_000);
    assert.equal(breakdown.dueAfterDiscount, 8_000);
    const app = recordPaymentApplication({
      cashEntered,
      cashbackDiscount: breakdown.cashbackDiscount,
      dueAfterDiscount: breakdown.dueAfterDiscount,
      applyOverpaymentAsCredit: true,
    });
    assert.equal(app.cashToCollect, 8_000);
    assert.equal(app.totalAppliedToBill, 10_000);
    assert.equal(app.excessCredit, 4_000);
    assert.equal(app.ledgerPaymentAmount, 14_000);
    assert.equal(app.transactionAmount, 12_000);
    assert.equal(
      nextLedgerBalanceAfterBookingPayment({
        ledgerBalance: 0,
        bookingBillBefore: bill,
        paymentAmount: app.ledgerPaymentAmount,
      }),
      -4_000,
    );
  });

  it("still records a partial payment below the bill", () => {
    const app = recordPaymentApplication({
      cashEntered: 3_500,
      cashbackDiscount: 0,
      dueAfterDiscount: 10_000,
      applyOverpaymentAsCredit: true,
    });
    assert.equal(app.cashToCollect, 3_500);
    assert.equal(app.excessCredit, 0);
    assert.equal(app.ledgerPaymentAmount, 3_500);
    assert.equal(app.transactionAmount, 3_500);
  });
});
