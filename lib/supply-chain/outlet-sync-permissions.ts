import { hasPermission } from '@/lib/permissions'

export function canSyncRestaurantBatchToOutlet(role: string): boolean {
  return hasPermission(role, 'outlet:menu') || hasPermission(role, 'roles:manage')
}
