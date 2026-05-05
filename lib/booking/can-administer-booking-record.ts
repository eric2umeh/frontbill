/**
 * Structural booking record changes (edit core fields, delete booking, adjust folio line items)
 * are limited to property administrators — not front desk or manager roles.
 */
export function canAdministerBookingRecord(role: string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin'
}
