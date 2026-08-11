import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextLedgerBalanceAfterCashIn } from "../lib/utils/guest-city-ledger.ts";

describe("nextLedgerBalanceAfterCashIn — guest-synced folios", () => {
  it("stores only leftover as credit when payment clears folio debt from zero ledger", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: 0,
        cashIn: 100_000,
        folioBefore: 60_000,
        folioRemaining: 0,
      }),
      -40_000,
    );
  });

  it("accumulates top-up onto existing prepaid credit (does not wipe prior credit)", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: -50_000,
        cashIn: 20_000,
        folioBefore: 0,
        folioRemaining: 0,
      }),
      -70_000,
    );
  });

  it("preserves prepaid credit when a later payment only clears folio debt", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: -50_000,
        cashIn: 60_000,
        folioBefore: 60_000,
        folioRemaining: 0,
      }),
      -50_000,
    );
  });

  it("adds leftover onto existing credit after clearing folio", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: -50_000,
        cashIn: 100_000,
        folioBefore: 60_000,
        folioRemaining: 0,
      }),
      -90_000,
    );
  });

  it("keeps ledger-only debit beyond folio after a folio-sized payment", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: 100_000,
        cashIn: 60_000,
        folioBefore: 60_000,
        folioRemaining: 0,
      }),
      40_000,
    );
  });

  it("mirrors remaining folio debt on partial payment", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: 0,
        cashIn: 40_000,
        folioBefore: 100_000,
        folioRemaining: 60_000,
      }),
      60_000,
    );
  });
});

describe("nextLedgerBalanceAfterCashIn — external folio apply (booking Add Credit)", () => {
  it("does not invent credit when cash fully covers the bill", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: 0,
        cashIn: 50_000,
        externalFolioApplied: 50_000,
      }),
      0,
    );
  });

  it("stores only excess over the bill as prepaid credit", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: 0,
        cashIn: 80_000,
        externalFolioApplied: 50_000,
      }),
      -30_000,
    );
  });

  it("accumulates booking top-up onto existing credit when bill is clear", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: -50_000,
        cashIn: 20_000,
        externalFolioApplied: 0,
      }),
      -70_000,
    );
  });

  it("reduces ledger debit when cash is applied to a matching bill", () => {
    assert.equal(
      nextLedgerBalanceAfterCashIn({
        priorBalance: 100_000,
        cashIn: 50_000,
        externalFolioApplied: 50_000,
      }),
      50_000,
    );
  });
});
