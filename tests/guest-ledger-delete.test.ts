import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ilikeExactPattern,
  ilikeNameWordPattern,
  individualLedgerIdsForGuestName,
  ledgerIdsToDeleteWithGuest,
} from "../lib/guests/guest-ledger-delete.ts";

describe("individualLedgerIdsForGuestName", () => {
  const accounts = [
    { id: "chioma", account_name: "Chioma Adeyemi", account_type: "individual", balance: 80000 },
    { id: "chioma-case", account_name: "chioma  adeyemi", account_type: "guest" },
    { id: "percent", account_name: "100% Guest", account_type: "individual" },
    { id: "underscore", account_name: "Ada_Okonkwo", account_type: "individual" },
    { id: "ada", account_name: "Ada Okonkwo", account_type: "individual" },
    { id: "org", account_name: "Chioma Adeyemi", account_type: "organization" },
  ];

  it("matches the same guest name and leaves other accounts alone", () => {
    assert.deepEqual(individualLedgerIdsForGuestName(accounts, "Chioma Adeyemi"), [
      "chioma",
      "chioma-case",
    ]);
  });

  it("treats % and _ as part of the name", () => {
    assert.deepEqual(individualLedgerIdsForGuestName(accounts, "100% Guest"), ["percent"]);
    assert.deepEqual(individualLedgerIdsForGuestName(accounts, "%"), []);
    assert.deepEqual(individualLedgerIdsForGuestName(accounts, "Ada_Okonkwo"), ["underscore"]);
    assert.deepEqual(individualLedgerIdsForGuestName(accounts, "Ada Okonkwo"), ["ada"]);
  });

  it("escapes ILIKE wildcards so a name cannot match every account", () => {
    assert.equal(ilikeExactPattern("100% Guest"), "100\\% Guest");
    assert.equal(ilikeExactPattern("%"), "\\%");
    assert.equal(ilikeExactPattern("Ada_Okonkwo"), "Ada\\_Okonkwo");
    assert.equal(ilikeNameWordPattern("Chioma  Adeyemi"), "Chioma%Adeyemi");
    assert.equal(ilikeNameWordPattern("% Guest"), "\\%%Guest");
  });
});

describe("ledgerIdsToDeleteWithGuest", () => {
  it("keeps the account when another guest still uses that name", () => {
    assert.deepEqual(
      ledgerIdsToDeleteWithGuest({
        matchedIds: ["chioma"],
        anotherGuestSharesName: true,
        referencedIds: [],
      }),
      [],
    );
  });

  it("keeps an account that a remaining folio or outlet order still points at", () => {
    assert.deepEqual(
      ledgerIdsToDeleteWithGuest({
        matchedIds: ["chioma", "empty"],
        anotherGuestSharesName: false,
        referencedIds: ["chioma"],
      }),
      ["empty"],
    );
  });

  it("deletes only an unreferenced account for a unique guest", () => {
    assert.deepEqual(
      ledgerIdsToDeleteWithGuest({
        matchedIds: ["chioma"],
        anotherGuestSharesName: false,
        referencedIds: [],
      }),
      ["chioma"],
    );
  });
});
