import assert from "node:assert/strict";
import test from "node:test";

import { resolveLongerSupplySnapshot } from "../lib/supply-chain/snapshot-merge";

test("resolveLongerSupplySnapshot hydrates uploaded local rows when remote is empty", () => {
  const local = [{ id: "po-1" }, { id: "po-2" }];

  assert.deepEqual(resolveLongerSupplySnapshot(local, []), local);
  assert.deepEqual(resolveLongerSupplySnapshot(local, undefined), local);
});

test("resolveLongerSupplySnapshot keeps remote rows when local is not longer", () => {
  const local = [{ id: "po-1" }];
  const remote = [{ id: "po-1" }, { id: "po-2" }];

  assert.deepEqual(resolveLongerSupplySnapshot(local, remote), remote);
  assert.deepEqual(resolveLongerSupplySnapshot(remote, remote), remote);
});
