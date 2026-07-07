export function resolveProfileOrganizationScope(
  profileOrganizationId: string | null | undefined,
  clientOrganizationId: string | null | undefined,
): string | null {
  const profileOrgId = String(profileOrganizationId ?? '').trim()
  if (!profileOrgId) return null

  const requestedOrgId = String(clientOrganizationId ?? '').trim()
  if (requestedOrgId && requestedOrgId !== profileOrgId) return null

  return profileOrgId
}
