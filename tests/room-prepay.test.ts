import assert from "node:assert/strict";
import test from "node:test";
import { splitRoomPrepay } from "../lib/payments/room-prepay";
import { summarizeDayLedgerCollections } from "../lib/payments/day-ledger-collections";

test("pay-above room total keeps excess as credit and drawer cash", () => {
  const split = splitRoomPrepay({
    roomTotal: 100_000,
    cashTendered: 150_000,
    payAboveRoomTotal: true,
  });

  assert.equal(split.cashTowardBill, 100_000);
  assert.equal(split.excessCredit, 50_000);
  assert.equal(split.cashDrawer, 150_000);
  assert.equal(split.depositApplied, 100_000);
  assert.equal(split.balanceRemaining, 0);
  assert.equal(split.depositApplied - 100_000, 0);
});

test("without pay-above, tender above the bill stays capped", () => {
  const split = splitRoomPrepay({
    roomTotal: 100_000,
    cashTendered: 150_000,
    payAboveRoomTotal: false,
  });

  assert.equal(split.cashTowardBill, 100_000);
  assert.equal(split.excessCredit, 0);
  assert.equal(split.cashDrawer, 100_000);
  assert.equal(split.balanceRemaining, 0);
});

test("partial tender below the bill does not create credit", () => {
  const split = splitRoomPrepay({
    roomTotal: 100_000,
    cashTendered: 30_000,
    payAboveRoomTotal: true,
  });

  assert.equal(split.cashTowardBill, 30_000);
  assert.equal(split.excessCredit, 0);
  assert.equal(split.cashDrawer, 30_000);
  assert.equal(split.depositApplied, 30_000);
  assert.equal(split.balanceRemaining, 70_000);
});

test("cashback discount plus pay-above credits only the leftover cash", () => {
  const split = splitRoomPrepay({
    roomTotal: 100_000,
    cashTendered: 150_000,
    cashbackBalance: 20_000,
    applyCashback: true,
    payAboveRoomTotal: true,
  });

  assert.equal(split.cashbackDiscount, 20_000);
  assert.equal(split.dueAfterDiscount, 80_000);
  assert.equal(split.cashTowardBill, 80_000);
  assert.equal(split.excessCredit, 70_000);
  assert.equal(split.cashDrawer, 150_000);
  assert.equal(split.depositApplied, 100_000);
  assert.equal(split.balanceRemaining, 0);
});

test("full room tender with cashback does not invent credit", () => {
  const split = splitRoomPrepay({
    roomTotal: 100_000,
    cashTendered: 100_000,
    cashbackBalance: 20_000,
    applyCashback: true,
    payAboveRoomTotal: false,
  });

  assert.equal(split.cashTowardBill, 80_000);
  assert.equal(split.excessCredit, 0);
  assert.equal(split.cashDrawer, 80_000);
  assert.equal(split.depositApplied, 100_000);
  assert.equal(split.balanceRemaining, 0);
});

test("drawer counts overpay cash once", () => {
  const split = splitRoomPrepay({
    roomTotal: 100_000,
    cashTendered: 150_000,
    payAboveRoomTotal: true,
  });
  const at = "2026-11-03T12:00:00.000Z";
  const summary = summarizeDayLedgerCollections(
    [
      {
        amount: split.cashDrawer,
        payment_method: "pos",
        status: "paid",
        booking_id: "booking-1",
        created_at: at,
        transaction_id: "TXN-1",
      },
    ],
    [
      {
        amount: split.cashDrawer,
        payment_method: "pos",
        booking_id: "booking-1",
        payment_date: at,
      },
    ],
  );

  assert.equal(summary.revenues.pos, 150_000);
  assert.equal(summary.totalRevenue, 150_000);
});
