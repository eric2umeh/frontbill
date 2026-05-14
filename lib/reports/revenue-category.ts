/**
 * Department / revenue line for reporting, receipts, and future hall-only bookings.
 * Persist optional `folio_charges.revenue_category`; otherwise infer from description.
 */

export type RevenueDepartment =
  | "accommodation"
  | "restaurant"
  | "bar"
  | "laundry"
  | "swimming"
  | "gym"
  | "hall_rebecca"
  | "hall_floxy"
  | "hall_board_room"
  | "events"
  | "other";

export const REVENUE_DEPARTMENT_LABELS: Record<RevenueDepartment, string> = {
  accommodation: "Accommodation",
  restaurant: "Restaurant",
  bar: "Bar",
  laundry: "Laundry",
  swimming: "Swimming pool",
  gym: "Gym",
  hall_rebecca: "Rebecca Hall (banquet)",
  hall_floxy: "Floxy Hall (banquet)",
  hall_board_room: "Board Room (banquet)",
  events: "Events / halls (general)",
  other: "Other",
};

export const REPORT_DEPARTMENT_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "accommodation", label: "Accommodation" },
  { value: "restaurant", label: "Restaurant" },
  { value: "bar", label: "Bar" },
  { value: "laundry", label: "Laundry" },
  { value: "swimming", label: "Swimming pool" },
  { value: "gym", label: "Gym" },
  { value: "hall_rebecca", label: "Rebecca Hall" },
  { value: "hall_floxy", label: "Floxy Hall" },
  { value: "hall_board_room", label: "Board Room" },
  { value: "events", label: "Events / halls" },
  { value: "other", label: "Other" },
];

/** Normalize DB or API string to RevenueDepartment */
export function parseRevenueCategory(
  raw: string | null | undefined,
): RevenueDepartment {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const keys = Object.keys(REVENUE_DEPARTMENT_LABELS) as RevenueDepartment[];
  if (keys.includes(s as RevenueDepartment)) return s as RevenueDepartment;
  return "other";
}

/**
 * Infer department from free-text description and charge_type.
 * Hall-only guests (no room) can still post charges tagged in description, e.g. "Board Room — catering".
 */
export function inferRevenueCategory(
  chargeType: string | null | undefined,
  description: string | null | undefined,
): RevenueDepartment {
  const t = String(chargeType || "").toLowerCase();
  const d = String(description || "").toLowerCase();

  if (["room_charge", "extended_stay", "reservation"].includes(t))
    return "accommodation";
  if (t === "folio_note") return "other";

  if (/\brebecca\b/.test(d) || /\brebecca hall\b/.test(d))
    return "hall_rebecca";
  if (/\bfloxy\b/.test(d) || /\bfloxy hall\b/.test(d)) return "hall_floxy";
  if (/\bboard room\b/.test(d) || /\bboardroom\b/.test(d))
    return "hall_board_room";
  if (/\bbanquet\b/.test(d) || /\bhall\b/.test(d) || /\bevent\b/.test(d))
    return "events";

  if (
    /\brestaurant\b/.test(d) ||
    /\bdinner\b/.test(d) ||
    /\blunch\b/.test(d) ||
    /\bbreakfast\b/.test(d) ||
    /\bfood\b/.test(d)
  )
    return "restaurant";
  if (
    /\bbar\b/.test(d) ||
    /\bdrinks?\b/.test(d) ||
    /\bbeverage\b/.test(d) ||
    /\bminibar\b/.test(d)
  )
    return "bar";
  if (/\blaundry\b/.test(d)) return "laundry";
  if (/\bswim\b/.test(d) || /\bpool\b/.test(d)) return "swimming";
  if (/\bgym\b/.test(d) || /\bfitness\b/.test(d)) return "gym";

  return "other";
}

export function resolveRevenueCategory(
  stored: string | null | undefined,
  chargeType: string | null | undefined,
  description: string | null | undefined,
): RevenueDepartment {
  if (stored && String(stored).trim()) return parseRevenueCategory(stored);
  return inferRevenueCategory(chargeType, description);
}
