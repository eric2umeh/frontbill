import { normalizeLedgerAccountName } from "@/lib/utils/guest-city-ledger";

export type GuestLedgerDeleteCandidate = {
  id: string;
  account_name?: string | null;
  account_type?: string | null;
};

/** ILIKE pattern that matches this name exactly (`%` and `_` are literal). */
export function ilikeExactPattern(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * ILIKE pattern that still matches extra internal whitespace.
 * Callers must confirm with `normalizeLedgerAccountName` before deleting.
 */
export function ilikeNameWordPattern(value: string): string {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => ilikeExactPattern(part))
    .filter(Boolean);
  return parts.join("%");
}

function isIndividualLedgerType(accountType: string | null | undefined): boolean {
  const type = String(accountType || "individual")
    .trim()
    .toLowerCase();
  return type === "individual" || type === "guest";
}

/** City-ledger rows whose name is this guest, ignoring case and repeated spaces. */
export function individualLedgerIdsForGuestName(
  accounts: GuestLedgerDeleteCandidate[],
  guestName: string,
): string[] {
  const key = normalizeLedgerAccountName(guestName);
  if (!key) return [];
  const ids: string[] = [];
  for (const account of accounts) {
    if (!account?.id) continue;
    if (!isIndividualLedgerType(account.account_type)) continue;
    if (normalizeLedgerAccountName(String(account.account_name || "")) !== key) continue;
    ids.push(account.id);
  }
  return ids;
}

/**
 * Accounts that may be removed with this guest profile.
 * A shared name or a remaining folio/outlet reference keeps the receivable.
 */
export function ledgerIdsToDeleteWithGuest(args: {
  matchedIds: string[];
  anotherGuestSharesName: boolean;
  referencedIds: Iterable<string>;
}): string[] {
  if (args.anotherGuestSharesName) return [];
  const referenced = new Set(args.referencedIds);
  return args.matchedIds.filter((id) => id && !referenced.has(id));
}
