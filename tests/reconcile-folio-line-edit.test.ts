import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickMatchingPaymentTransaction,
  reconcileBookingAfterEditedFolioLine,
  reopenPositiveChargeIds,
  settlePositiveChargeIds,
} from "../lib/booking/reconcile-folio-line-edit";
import {
  bookingDisplayBillBalance,
  folioPositiveOutstandingSum,
} from "../lib/utils/booking-bill-balance";

describe("reconcileBookingAfterEditedFolioLine", () => {
  it("reopens a fully paid stay when the room charge is raised after payment", () => {
    const room = {
      id: "c1",
      amount: 80_000,
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
    const previous = {
      id: "c1",
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const next = reconcileBookingAfterEditedFolioLine({
      previous,
      nextAmount: 80_000,
      remaining: [room, payment],
    });
    assert.equal(next.deposit, 50_000);
    assert.equal(next.balance, 30_000);
    assert.equal(next.payment_status, "partial");
    assert.equal(next.reopenPositiveCharges, true);
    assert.equal(next.settlePositiveCharges, false);
    assert.equal(next.updateMatchingPaymentTransaction, false);
    assert.deepEqual(reopenPositiveChargeIds([room, payment]), ["c1"]);

    const reopened = [{ ...room, payment_status: "pending" }, payment];
    assert.equal(folioPositiveOutstandingSum(reopened), 30_000);
    assert.equal(
      bookingDisplayBillBalance(
        { deposit: next.deposit, balance: next.balance, total_amount: 80_000 },
        reopened,
      ),
      30_000,
    );
  });

  it("legacy unpaid-only sum would leave a raised paid room charge at ₦0 due", () => {
    const remaining = [
      { amount: 80_000, charge_type: "room_charge", payment_status: "paid" },
      {
        amount: -50_000,
        charge_type: "payment",
        payment_status: "paid",
        payment_method: "cash",
      },
    ];
    const legacyUnpaid = remaining
      .filter((c) => c.payment_status !== "paid")
      .reduce((sum, c) => sum + Number(c.amount), 0);
    assert.equal(Math.max(0, legacyUnpaid), 0);
    assert.equal(folioPositiveOutstandingSum(remaining), 0);
  });

  it("reopens the folio when a recorded payment line is reduced", () => {
    const room = {
      id: "c1",
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const payment = {
      id: "p1",
      amount: -30_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "pos",
    };
    const previous = {
      id: "p1",
      amount: -50_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "pos",
    };
    const next = reconcileBookingAfterEditedFolioLine({
      previous,
      nextAmount: -30_000,
      remaining: [room, payment],
    });
    assert.equal(next.deposit, 30_000);
    assert.equal(next.balance, 20_000);
    assert.equal(next.payment_status, "partial");
    assert.equal(next.reopenPositiveCharges, true);
    assert.equal(next.updateMatchingPaymentTransaction, true);
    assert.equal(next.previousPaymentAmount, 50_000);
    assert.equal(next.nextPaymentAmount, 30_000);

    const reopened = [{ ...room, payment_status: "pending" }, payment];
    assert.equal(folioPositiveOutstandingSum(reopened), 20_000);
  });

  it("settles pending room charges when a partial payment is raised to the bill", () => {
    const room = {
      id: "c1",
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "pending",
    };
    const payment = {
      id: "p1",
      amount: -50_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cash",
    };
    const previous = {
      id: "p1",
      amount: -5_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cash",
    };
    const next = reconcileBookingAfterEditedFolioLine({
      previous,
      nextAmount: -50_000,
      remaining: [room, payment],
    });
    assert.equal(next.deposit, 50_000);
    assert.equal(next.balance, 0);
    assert.equal(next.payment_status, "paid");
    assert.equal(next.reopenPositiveCharges, false);
    assert.equal(next.settlePositiveCharges, true);
    assert.equal(next.updateMatchingPaymentTransaction, true);
    assert.equal(next.previousPaymentAmount, 5_000);
    assert.equal(next.nextPaymentAmount, 50_000);
    assert.deepEqual(settlePositiveChargeIds([room, payment]), ["c1"]);

    const settled = [{ ...room, payment_status: "paid" }, payment];
    assert.equal(folioPositiveOutstandingSum(settled), 0);
  });

  it("does not treat editing a pending extra charge as a payment change", () => {
    const room = {
      id: "c1",
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "pending",
    };
    const extra = {
      id: "x1",
      amount: 8_000,
      charge_type: "minibar",
      payment_status: "pending",
    };
    const next = reconcileBookingAfterEditedFolioLine({
      previous: { ...extra, amount: 5_000 },
      nextAmount: 8_000,
      remaining: [room, extra],
    });
    assert.equal(next.deposit, 0);
    assert.equal(next.balance, 58_000);
    assert.equal(next.payment_status, "pending");
    assert.equal(next.updateMatchingPaymentTransaction, false);
    assert.equal(next.previousPaymentAmount, 0);
  });

  it("keeps a still-covered stay paid when the room charge is lowered", () => {
    const room = {
      id: "c1",
      amount: 30_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const payment = {
      id: "p1",
      amount: -50_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "transfer",
    };
    const next = reconcileBookingAfterEditedFolioLine({
      previous: { ...room, amount: 50_000 },
      nextAmount: 30_000,
      remaining: [room, payment],
    });
    assert.equal(next.deposit, 50_000);
    assert.equal(next.balance, 0);
    assert.equal(next.payment_status, "paid");
    assert.equal(next.reopenPositiveCharges, false);
    assert.equal(next.settlePositiveCharges, true);
    assert.equal(next.updateMatchingPaymentTransaction, false);
    assert.equal(folioPositiveOutstandingSum([room, payment]), 0);
  });

  it("skips Daily book updates for cashback payment lines", () => {
    const room = {
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "paid",
    };
    const cashback = {
      amount: -2_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cashback",
    };
    const cash = {
      amount: -48_000,
      charge_type: "payment",
      payment_status: "paid",
      payment_method: "cash",
    };
    const next = reconcileBookingAfterEditedFolioLine({
      previous: { ...cashback, amount: -5_000 },
      nextAmount: -2_000,
      remaining: [room, cashback, cash],
    });
    assert.equal(next.deposit, 50_000);
    assert.equal(next.balance, 0);
    assert.equal(next.updateMatchingPaymentTransaction, false);
  });

  it("does not reopen posted-to-ledger city ledger charges", () => {
    const room = {
      id: "c1",
      amount: 50_000,
      charge_type: "room_charge",
      payment_status: "posted_to_ledger",
      payment_method: "city_ledger",
    };
    const extra = {
      id: "x1",
      amount: 10_000,
      charge_type: "laundry",
      payment_status: "pending",
    };
    const next = reconcileBookingAfterEditedFolioLine({
      previous: { ...extra, amount: 5_000 },
      nextAmount: 10_000,
      remaining: [room, extra],
    });
    assert.equal(next.balance, 10_000);
    assert.deepEqual(reopenPositiveChargeIds([room, extra]), ["x1"]);
  });
});

describe("pickMatchingPaymentTransaction", () => {
  it("matches an open PAY row by amount and skips voided rows", () => {
    const match = pickMatchingPaymentTransaction(
      [
        {
          id: "old",
          amount: 50_000,
          transaction_id: "PAY-b1-1",
          status: "void",
          description: "Payment received - cash",
        },
        {
          id: "hit",
          amount: 50_000,
          transaction_id: "PAY-b1-2",
          status: "paid",
          description: "Payment received - cash",
        },
      ],
      50_000,
    );
    assert.equal(match?.id, "hit");
  });

  it("ignores non-payment transactions of the same amount", () => {
    const match = pickMatchingPaymentTransaction(
      [
        {
          id: "room",
          amount: 50_000,
          transaction_id: "EXT-b1-1",
          status: "paid",
          description: "Extend stay",
        },
      ],
      50_000,
    );
    assert.equal(match, null);
  });
});
