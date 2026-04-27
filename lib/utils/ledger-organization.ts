export function isGeneratedHotelName(name?: string | null) {
  return /\bhotel\b/i.test(String(name || '').trim())
}

export function isOrganizationMenuRecord(record: any, allowedCreatorIds?: Set<string>) {
  if (!record?.org_type || isGeneratedHotelName(record?.name)) return false
  if (allowedCreatorIds && !allowedCreatorIds.has(record?.created_by)) return false
  return true
}

export function isSelectableLedgerName(name?: string | null) {
  return !isGeneratedHotelName(name)
}
