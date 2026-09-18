import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInHouseForNightAudit,
  nightAuditOccupiedRoomIds,
  nightAuditPendingCheckouts,
  occupiedRoomsMissingInHouseStay,
  selectInHouseForNightAudit,
} from "../lib/night-audit/in-house-for-audit";

const closing = "2026-09-18";

describe("isInHouseForNightAudit", () => {
  it("counts a walk-in confirmed stay (Dashboard Check-in / same-day New Booking)", () => {
    assert.equal(
      isInHouseForNightAudit(
        {
          status: "confirmed",
          check_in: "2026-09-18",
          check_out: "2026-09-20",
        },
        closing,
      ),
      true,
    );
  });

  it("counts a reservation arrival that was checked in", () => {
    assert.equal(
      isInHouseForNightAudit(
        {
          status: "checked_in",
          check_in: "2026-09-17",
          check_out: "2026-09-19",
        },
        closing,
      ),
      true,
    );
  });

  it("does not count a future reservation", () => {
    assert.equal(
      isInHouseForNightAudit(
        {
          status: "reserved",
          check_in: "2026-09-18",
          check_out: "2026-09-20",
        },
        closing,
      ),
      false,
    );
  });

  it("does not count a future confirmed arrival", () => {
    assert.equal(
      isInHouseForNightAudit(
        {
          status: "confirmed",
          check_in: "2026-09-20",
          check_out: "2026-09-22",
        },
        closing,
      ),
      false,
    );
  });

  it("does not count checked-out or cancelled folios", () => {
    assert.equal(
      isInHouseForNightAudit(
        {
          status: "checked_in",
          folio_status: "checked_out",
          check_in: "2026-09-17",
          check_out: "2026-09-19",
        },
        closing,
      ),
      false,
    );
    assert.equal(
      isInHouseForNightAudit(
        {
          status: "cancelled",
          check_in: "2026-09-18",
          check_out: "2026-09-20",
        },
        closing,
      ),
      false,
    );
  });

  it("still counts overdue in-house guests who have not been checked out", () => {
    assert.equal(
      isInHouseForNightAudit(
        {
          status: "confirmed",
          check_in: "2026-09-10",
          check_out: "2026-09-17",
        },
        closing,
      ),
      true,
    );
  });
});

describe("night audit occupancy from mixed stays", () => {
  const rows = [
    {
      id: "walk-in",
      room_id: "101",
      status: "confirmed",
      check_in: "2026-09-18",
      check_out: "2026-09-18",
    },
    {
      id: "arrival",
      room_id: "102",
      status: "checked_in",
      check_in: "2026-09-17",
      check_out: "2026-09-20",
    },
    {
      id: "future-res",
      room_id: "103",
      status: "reserved",
      check_in: "2026-09-19",
      check_out: "2026-09-21",
    },
    {
      id: "future-confirmed",
      room_id: "104",
      status: "confirmed",
      check_in: "2026-09-21",
      check_out: "2026-09-23",
    },
  ];

  it("occupancy includes walk-ins and misses only future/reserved", () => {
    const inHouse = selectInHouseForNightAudit(rows, closing);
    assert.deepEqual(
      inHouse.map((b) => b.id).sort(),
      ["arrival", "walk-in"],
    );
    const totalRooms = 10;
    const occupancyRate = Math.round((inHouse.length / totalRooms) * 100);
    assert.equal(occupancyRate, 20);
  });

  it("does not flag an occupied walk-in room as a status mismatch", () => {
    const inHouse = selectInHouseForNightAudit(rows, closing);
    const roomIds = nightAuditOccupiedRoomIds(inHouse);
    const mismatches = occupiedRoomsMissingInHouseStay(
      [
        { id: "101", room_number: "101" },
        { id: "102", room_number: "102" },
        { id: "201", room_number: "201" },
      ],
      roomIds,
    );
    assert.deepEqual(
      mismatches.map((r) => r.room_number),
      ["201"],
    );
  });

  it("pending checkouts include confirmed walk-ins due out on the closing date", () => {
    const inHouse = selectInHouseForNightAudit(rows, closing);
    const pending = nightAuditPendingCheckouts(inHouse, closing);
    assert.deepEqual(
      pending.map((b) => b.id),
      ["walk-in"],
    );
  });
});
