import { hasPermission } from '@/lib/permissions'
import { isBookingCheckedOut } from '@/lib/utils/booking-checkout-ui'

/** Submit a move-dates request (front desk / receptionist). */
export function canRequestRescheduleStay(role: string | null | undefined): boolean {
  return hasPermission(role, 'reschedule_stay:request')
}

/** Approve or reject move-dates requests (manager / admin / superadmin). */
export function canApproveRescheduleStay(role: string | null | undefined): boolean {
  return hasPermission(role, 'reschedule_stay:approve')
}

/** @deprecated Use canRequestRescheduleStay */
export function canRescheduleStay(role: string | null | undefined): boolean {
  return canRequestRescheduleStay(role)
}

export type RescheduleStayBooking = {
  status?: string | null
  folio_status?: string | null
}

/** Reserved or confirmed folios that have not checked out. */
export function canRescheduleStayBooking(booking: RescheduleStayBooking): boolean {
  if (isBookingCheckedOut({ status: booking.status || '', folio_status: booking.folio_status })) {
    return false
  }
  const st = String(booking.status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return st === 'reserved' || st === 'confirmed'
}
