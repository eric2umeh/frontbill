/**
 * Matches onboarding / staff-style property rows: `{Person}'s Hotel` or `{Person}’s Hotel`
 * (ASCII or curly apostrophe). These belong in tenancy, not city-ledger counterparties.
 */
export function isPossessivePropertyHotelOrganizationName(name?: string | null): boolean {
  const s = String(name ?? '').trim()
  if (!s) return false
  return /[\x27\u2019]s\s+hotel\b/i.test(s)
}

/** Legacy helper: treat possessive onboarding names or any name containing “hotel” as non-selectable in ledger/account pickers. */
export function isGeneratedHotelName(name?: string | null) {
  const s = String(name ?? '').trim()
  if (!s) return false
  if (isPossessivePropertyHotelOrganizationName(s)) return true
  return /\bhotel\b/i.test(s)
}

/**
 * Rows shown in Organizations menu — city ledger counterparties with org_type set.
 * Exclude the logged-in user's hotel tenant row (profiles.organization_id). Exclude onboarding-style property names (`'s Hotel`).
 */
export function isOrganizationMenuRecord(record: any, tenantOrganizationId?: string | null) {
  if (!record?.id || !record?.org_type || String(record.org_type).trim() === '') return false
  if (tenantOrganizationId && record.id === tenantOrganizationId) return false
  if (isPossessivePropertyHotelOrganizationName(record.name)) return false
  return true
}

/** Use when showing city ledger account names / org-counterparty picks (booking, reservation, charges, …). */
export function isSelectableLedgerName(name?: string | null) {
  return !isGeneratedHotelName(name)
}
