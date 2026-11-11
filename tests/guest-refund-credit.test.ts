import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookingBalanceAfterRefundCredit,
  bookingColumnsAfterRefundWithoutFolio,
  ledgerBalanceAfterRefund,
  planGuestRefundCredit,
  type RefundBookingCandidate,
} from "../lib/refunds/guest-refund-credit";

const room = (amount: number, status: string, method = "") => ({
  amount,
  charge_type: "room_charge",
  payment_status: status,
  payment_method: method,
});

const payment = (amount: number) => ({
  amount,
  charge_type: "payment",
  payment_status: "paid",
  payment_method: "cash",
});

describe("bookingBalanceAfterRefundCredit", () => {
  it("cuts an unpaid folio by the refund instead of leaving checkout to collect it", () => {
    const balance = bookingBalanceAfterRefundCredit(
      [room(40000, "pending")],
      10000,
    );
    assert.equal(balance, 30000);
  });

  it("clears the folio when the refund matches the unpaid stay", () => {
    const balance = bookingBalanceAfterRefundCredit(
      [room(40000, "pending")],
      40000,
    );
    assert.equal(balance, 0);
  });

  it("keeps cash above the unpaid bill as guest credit", () => {
    const balance = bookingBalanceAfterRefundCredit(
      [room(40000, "pending")],
      50000,
    );
    assert.equal(balance, -10000);
  });

  it("gives a fully paid stay credit instead of reopening the room charge", () => {
    const balance = bookingBalanceAfterRefundCredit(
      [room(40000, "paid", "cash"), payment(-40000)],
      10000,
    );
    assert.equal(balance, -10000);
  });
});

describe("bookingColumnsAfterRefundWithoutFolio", () => {
  it("lowers a balance-only bill without cutting the deposit", () => {
    const next = bookingColumnsAfterRefundWithoutFolio({
      balance: 40000,
      totalAmount: 40000,
      deposit: 0,
      refundAmount: 10000,
    });
    assert.deepEqual(next, { balance: 30000, totalAmount: 30000 });
  });

  it("does not reopen a paid stay by shrinking the deposit", () => {
    const next = bookingColumnsAfterRefundWithoutFolio({
      balance: 0,
      totalAmount: 40000,
      deposit: 40000,
      refundAmount: 10000,
    });
    assert.equal(next.totalAmount, 40000);
    assert.equal(next.balance, -10000);
    const displayed = Math.max(0, next.balance, next.totalAmount - 40000);
    assert.equal(displayed, 0);
  });
});

describe("ledgerBalanceAfterRefund", () => {
  it("reduces a city-ledger debit and can go into credit", () => {
    assert.equal(ledgerBalanceAfterRefund(50000, 10000), 40000);
    assert.equal(ledgerBalanceAfterRefund(5000, 8000), -3000);
  });
});

describe("planGuestRefundCredit", () => {
  const openStay: RefundBookingCandidate = {
    id: "stay-open",
    checkIn: "2026-11-01",
    outstanding: 40000,
    postedToLedger: false,
  };
  const paidStay: RefundBookingCandidate = {
    id: "stay-paid",
    checkIn: "2026-11-08",
    outstanding: 0,
    postedToLedger: false,
  };
  const ledgerStay: RefundBookingCandidate = {
    id: "stay-ledger",
    checkIn: "2026-11-02",
    outstanding: 0,
    postedToLedger: true,
  };

  it("credits the open folio when no booking id is pasted", () => {
    const plan = planGuestRefundCredit({
      bookings: [paidStay, openStay],
      ledgerBalance: 0,
    });
    assert.deepEqual(plan, { action: "folio", bookingId: "stay-open" });
  });

  it("credits the booking the cashier named", () => {
    const plan = planGuestRefundCredit({
      explicitBookingId: "stay-paid",
      bookings: [openStay, paidStay],
      ledgerBalance: 90000,
    });
    assert.deepEqual(plan, { action: "folio", bookingId: "stay-paid" });
  });

  it("reduces city ledger when the stay was posted there and the folio is clear", () => {
    const plan = planGuestRefundCredit({
      explicitBookingId: "stay-ledger",
      bookings: [ledgerStay],
      ledgerBalance: 40000,
    });
    assert.deepEqual(plan, { action: "ledger" });
  });

  it("reduces city ledger when the guest has no folio left to credit", () => {
    const plan = planGuestRefundCredit({
      bookings: [],
      ledgerBalance: 25000,
    });
    assert.deepEqual(plan, { action: "ledger" });
  });

  it("stores credit on a paid folio when nothing is owed", () => {
    const plan = planGuestRefundCredit({
      bookings: [paidStay],
      ledgerBalance: 0,
    });
    assert.deepEqual(plan, { action: "folio", bookingId: "stay-paid" });
  });
});
