import { canonicalRoleKey } from "@/lib/permissions";

/** First route after email/password login. Roles without `dashboard:view` land on their primary area. */
export function getPostLoginPath(role: string | null | undefined): string {
  const rk = canonicalRoleKey(role);
  if (rk === "store") return "/supply/store";
  if (rk === "purchaser") return "/supply/purchasing";
  if (rk === "food_beverage") return "/outlets";
  if (rk === "chef") return "/supply/kitchen";
  if (rk === "laundry") return "/outlets/laundry";
  if (rk === "gym") return "/outlets/gym";
  if (rk === "housekeeping") return "/housekeeping";
  if (rk === "maintenance") return "/maintenance";
  if (rk === "staff") return "/bookings";
  if (rk === "auditor") return "/supply/store";
  if (rk === "cashier") return "/outlets";
  return "/dashboard";
}
