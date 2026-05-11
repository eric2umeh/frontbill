import { canonicalRoleKey } from '@/lib/permissions'

/** First route after email/password login. Roles without `dashboard:view` land on their primary area. */
export function getPostLoginPath(role: string | null | undefined): string {
  const rk = canonicalRoleKey(role)
  if (rk === 'store') return '/store'
  if (rk === 'housekeeping') return '/housekeeping'
  if (rk === 'maintenance') return '/maintenance'
  if (rk === 'staff') return '/bookings'
  if (rk === 'auditor') return '/store'
  return '/dashboard'
}
