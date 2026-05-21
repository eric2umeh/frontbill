import { hasPermission } from '@/lib/permissions'

/** Treasury / front office roles that may print guest payment receipts without folio edit access. */
export function canPrintPaymentReceipt(role: string | null | undefined): boolean {
  if (!hasPermission(role, 'payments:view')) return false
  return (
    hasPermission(role, 'bookings:view') ||
    hasPermission(role, 'reservations:view') ||
    hasPermission(role, 'events:view')
  )
}
