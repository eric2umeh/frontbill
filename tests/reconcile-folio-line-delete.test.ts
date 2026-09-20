import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickMatchingPaymentTransaction,
  reconcileBookingAfterRemovedFolioLine,
  reopenPositiveChargeIds,
} from "../lib/booking/reconcile-folio-line-delete";
import {
  bookingDisplayBillBalance,
  folioPositiveOutstandingSum,
} from "../lib/utils/booking-bill-balance";

describe("reconcileBookingAfterRemovedFolioLine", () => {
  it("reopens a fully paid stay when the only payment line is deleted", () => {
    const room = {
      id: "c1",
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const payment = {
      id: "p1",
      amount: -50_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cash",
    };
    const next = reconcileBookingAfterRemovedFolioLine({
      deposit: 50_000,
      removed: payment,
      remaining: [room],
    });
    assert.equal(next.deposit, 0);
    assert.equal(next.balance, 50_000);
    assert.equal(next.payment_status, "pending");
    assert.equal(next.reopenPositiveCharges, true);
    assert.equal(next.voidMatchingPaymentTransaction, true);
    assert.equal(next.removedPaymentAmount, 50_000);

    const reopened = [{ ...room, payment_status: "pending" }];
    assert.equal(folioPositiveOutstandingSum(reopened), 50_000);
    assert.equal(
      bookingDisplayBillBalance(
        { deposit: next.deposit, balance: next.balance, total_amount: 50_000 },
        reopened,
      ),
      50_000,
    );
  });

  it("drops deposit so a deleted partial payment cannot be collected twice", () => {
    const room = {
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "pending",
    };
    const payment = {
      amount: -20_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "pos",
    };
    const next = reconcileBookingAfterRemovedFolioLine({
      deposit: 20_000,
      removed: payment,
      remaining: [room],
    });
    assert.equal(next.deposit, 0);
    assert.equal(next.balance, 50_000);
    assert.equal(next.payment_status, "pending");
    assert.equal(next.reopenPositiveCharges, true);

    // Legacy bug: deposit stayed 20k, folio showed 50k due, Record Payment
    // then did deposit += 50k → 70k on a 50k stay.
    const reRecordDeposit = next.deposit + 50_000;
    assert.equal(reRecordDeposit, 50_000);
  });

  it("keeps remaining payments and only reopens the uncovered portion", () => {
    const room = {
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const keep = {
      amount: -30_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "transfer",
    };
    const removed = {
      amount: -20_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cash",
    };
    const next = reconcileBookingAfterRemovedFolioLine({
      deposit: 50_000,
      removed,
      remaining: [room, keep],
    });
    assert.equal(next.deposit, 30_000);
    assert.equal(next.balance, 20_000);
    assert.equal(next.payment_status, "partial");
    assert.equal(next.reopenPositiveCharges, true);
  });

  it("does not treat deleting a pending extra charge as a payment reversal", () => {
    const room = {
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "pending",
    };
    const extra = {
      amount: 5_000,
      charge_type: "minibar",
      payment_status: "pending",
    };
    const next = reconcileBookingAfterRemovedFolioLine({
      deposit: 0,
      removed: extra,
      remaining: [room],
    });
    assert.equal(next.deposit, 0);
    assert.equal(next.balance, 50_000);
    assert.equal(next.payment_status, "pending");
    assert.equal(next.voidMatchingPaymentTransaction, false);
    assert.equal(next.removedPaymentAmount, 0);
  });

  it("leaves a still-covered folio paid when a surplus extra charge is removed", () => {
    const room = {
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const extra = {
      amount: 5_000,
      charge_type: "laundry",
      payment_status: "paid",
    };
    const payment = {
      amount: -55_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cash",
    };
    const next = reconcileBookingAfterRemovedFolioLine({
      deposit: 55_000,
      removed: extra,
      remaining: [room, payment],
    });
    assert.equal(next.deposit, 55_000);
    assert.equal(next.balance, 0);
    assert.equal(next.payment_status, "paid");
    assert.equal(next.reopenPositiveCharges, false);
  });

  it("ignores posted_to_ledger charges when deciding whether to reopen", () => {
    const posted = {
      id: "led",
      amount: 12_000,
      charge_type: "charge",
      payment_status: "posted_to_ledger",
      payment_method: "city_ledger",
    };
    const room = {
      id: "room",
      amount: 40_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const payment = {
      amount: -40_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cash",
    };
    const next = reconcileBookingAfterRemovedFolioLine({
      deposit: 40_000,
      removed: payment,
      remaining: [posted, room],
    });
    assert.equal(next.balance, 40_000);
    assert.deepEqual(reopenPositiveChargeIds([posted, room]), ["room"]);
  });

  it("does not void Daily book cash when the deleted line is cashback", () => {
    const next = reconcileBookingAfterRemovedFolioLine({
      deposit: 2_000,
      removed: {
        amount: -2_000,
        charge_type: "payment",
        payment_status: "paid",
        payment_method: "cashback",
      },
      remaining: [
        {
          amount: 10_000,
          charge_type: "room_charge",
          payment_status: "pending",
        },
      ],
    });
    assert.equal(next.deposit, 0);
    assert.equal(next.voidMatchingPaymentTransaction, false);
  });
});

describe("pickMatchingPaymentTransaction", () => {
  it("picks the newest matching PAY row and skips voided ones", () => {
    const match = pickMatchingPaymentTransaction(
      [
        {
          id: "old",
          amount: 20_000,
          description: "Payment received - cash",
          transaction_id: "PAY-b-1",
          status: "paid",
        },
        {
          id: "voided",
          amount: 20_000,
          description: "Payment received - cash",
          transaction_id: "PAY-b-2",
          status: "void",
        },
        {
          id: "newest",
          amount: 20_000,
          description: "Payment received - cash",
          transaction_id: "PAY-b-3",
          status: "paid",
        },
      ].reverse(),
      20_000,
    );
    assert.equal(match?.id, "newest");
  });

  it("ignores non-payment transactions of the same amount", () => {
    const match = pickMatchingPaymentTransaction(
      [
        {
          id: "chg",
          amount: 15_000,
          description: "Minibar charge",
          transaction_id: "CHG-b-1",
          status: "paid",
        },
      ],
      15_000,
    );
    assert.equal(match, null);
  });
});
