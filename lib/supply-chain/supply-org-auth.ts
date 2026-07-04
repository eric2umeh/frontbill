export function resolveAuthorizedSupplyOrgId(
  profileOrgId: string | null | undefined,
  clientOrgId: string | null | undefined,
): string | null {
  const orgId = typeof profileOrgId === 'string' ? profileOrgId.trim() : ''
  if (!orgId) return null
  if (clientOrgId?.trim() && clientOrgId.trim() !== orgId) return null
  return orgId
}
