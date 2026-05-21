import { hasPermission } from '@/lib/permissions'

export function canViewProfitabilityAnalytics(role: string | null | undefined): boolean {
  return hasPermission(role, 'analytics:view')
}

export function canEditProfitabilityAssumptions(role: string | null | undefined): boolean {
  if (!hasPermission(role, 'analytics:view')) return false
  const r = String(role || '').toLowerCase()
  return r === 'superadmin' || r === 'admin' || r === 'manager'
}
