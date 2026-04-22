# Session 2 PR Summary - FrontBill Bug Fixes & Feature Updates

## Overview
Fixed 6 critical issues and implemented 3 new features. All changes maintain backward compatibility and follow existing code patterns. Merged from `develop` branch (which contains latest updates from `main`).

---

## Issues Fixed

### 1. **Occupancy Report Showing Zero** ✅
**Problem**: Reports page occupancy was showing 0 even with confirmed reservations.
**Root Cause**: Query only checked bookings with `status IN ['active', 'checked_in']` but reservations have `status = 'confirmed'`.
**Solution**: Added `'confirmed'` to the occupancy status filter.
**Files Modified**: `app/(dashboard)/reports/page.tsx`

```sql
-- Before
.in('status', ['active', 'checked_in'])

-- After  
.in('status', ['active', 'checked_in', 'confirmed'])
```

---

### 2. **Staff Role Permissions Not Enforced** ✅
**Problem**: Staff users could view and create bookings/reservations/accounts despite having only `dashboard:view` and `bookings:view` permissions.
**Root Cause**: No permission checks on page-level buttons or sidebar routes.
**Solution**: 
- Added `hasPermission()` guards to "New Booking", "New Reservation" buttons
- Filtered sidebar routes by user role - staff only see Dashboard, Bookings (view), Rooms
- Staff now cannot access Accounts, Transactions, Organizations, Users & Roles menus

**Files Modified**: 
- `app/(dashboard)/bookings/page.tsx`
- `app/(dashboard)/reservations/page.tsx`
- `components/layout/sidebar.tsx`

---

### 3. **Duplicate Account Creation in New Booking/Reservation** ✅
**Problem**: Creating a guest "Soh" in step 1 then using city ledger in step 3 created 2 entries in Accounts menu (one guest, one city_ledger_account with 0 balance and one with 200,000).
**Root Cause**: Guest creation didn't auto-create matching city_ledger_account, so step 3 city ledger search found nothing and created new account.
**Solution**: When a new guest is created, automatically create a matching `city_ledger_accounts` entry with `account_type = 'individual'`. This ensures step 3 city ledger search finds the existing account and reuses it.

**Files Modified**:
- `components/bookings/new-booking-modal.tsx` (lines 508-517)
- `components/reservations/new-reservation-modal.tsx` (lines 315-324)

```typescript
// When new guest created, auto-create city_ledger_account
await supabase.from('city_ledger_accounts').insert([{
  organization_id: organizationId,
  account_name: fullName,
  account_type: 'individual',
  contact_phone: phone || null,
  contact_email: email || null,
  balance: 0,
}])
```

---

## Features Implemented

### 4. **Date Filters for City Ledger & Guests Reports** ✅
**Enhancement**: Added date range pickers to both City Ledger and Guests report sections.
**Implementation**:
- GuestReport: Filters guests by `last_visit` date within selected range
- CityLedgerReport: Filters accounts by `created_at` date within selected range
- Added "Clear" button to reset filters
- Empty state message indicates filtered results

**Files Modified**: `app/(dashboard)/reports/page.tsx`

**Code Pattern**:
```typescript
const filteredGuests = guests.filter((g) => {
  if (!startDate && !endDate) return true
  if (!g.last_visit) return false
  const visitDate = new Date(g.last_visit)
  if (startDate && visitDate < startOfDay(startDate)) return false
  if (endDate && visitDate > endOfDay(endDate)) return false
  return true
})
```

---

### 5. **Forgot Password Feature** ✅
**Enhancement**: Added "Forgot password?" link on login page with password reset flow.
**Implementation**:
- Click "Forgot password?" link opens dialog
- User enters email, receives Supabase password reset link via email
- Reset link redirects to password reset page (`/auth/reset-password`)
- Includes loading state and error handling

**Files Modified**: `app/auth/login/page.tsx`

**Features**:
- Forgot password dialog with email input
- Supabase `resetPasswordForEmail()` integration
- Toast notifications for success/error
- Responsive design

---

### 6. **Sidebar Permission-Based Route Filtering** ✅
**Enhancement**: Sidebar menu dynamically filters routes based on user role.
**Implementation**:
- Each route now has optional `permission` field
- Routes filtered by `hasPermission(user?.role, route.permission)`
- Safe fallback: shows all routes if user undefined (loading state)
- Staff role sees only: Dashboard, Bookings, Rooms

**Files Modified**: `components/layout/sidebar.tsx`

---

## Technical Details

### Permission Model Used
```typescript
// Staff role (existing)
staff: ['dashboard:view', 'rooms:view', 'bookings:view']

// Admin role (existing)
admin: [all permissions]
```

### Database Schema Notes
- City ledger auto-creation uses existing `city_ledger_accounts` table
- No schema migrations needed for this session
- `created_at` field already exists on `city_ledger_accounts` for date filtering

### Import Fixes
- Fixed missing `Hotel` icon import in sidebar that caused client-side crash on login

---

## Testing Checklist

- [ ] Login as Admin - verify all menus visible
- [ ] Login as Staff - verify only Dashboard, Bookings (view), Rooms visible; create buttons hidden
- [ ] Create booking with new guest "TestGuest" - verify only ONE entry in Accounts menu
- [ ] Create reservation with new guest "TestGuest2" - verify only ONE entry in Accounts menu
- [ ] View Occupancy report with confirmed reservation - verify count shows 1+
- [ ] Apply date filter in Guests report - verify list updates
- [ ] Apply date filter in City Ledger report - verify list updates
- [ ] Click "Forgot password?" on login - verify email input and send button work
- [ ] All pages load without client-side errors after login

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `app/(dashboard)/reports/page.tsx` | Added occupancy 'confirmed' filter; added date range filters to GuestReport & CityLedgerReport |
| `app/(dashboard)/bookings/page.tsx` | Added permission guard to "New Booking" button |
| `app/(dashboard)/reservations/page.tsx` | Added permission guards to "New Reservation" & "Bulk Booking" buttons |
| `components/bookings/new-booking-modal.tsx` | Auto-create city_ledger_account when guest created |
| `components/reservations/new-reservation-modal.tsx` | Auto-create city_ledger_account when guest created |
| `components/layout/sidebar.tsx` | Added permission fields to routes; filtered routes by user role; fixed icon imports |
| `app/auth/login/page.tsx` | Added forgot password dialog with Supabase password reset flow |

---

## Environment Requirements
No new environment variables needed. Uses existing Supabase auth configuration for password reset emails.

---

## Backward Compatibility
- All changes are backward compatible
- Existing guests/bookings/reservations unaffected
- New city_ledger_accounts created only for NEW guests going forward
- Existing staff users will lose access to restricted menus (by design)

---

## Known Limitations
**Bulk Reservation Grouping**: Currently creates 50 separate booking rows. Full grouping UI requires schema changes (`booking_group_id` field) and is marked for future enhancement.

---

## Next Steps
1. Merge to `develop` and test against live data
2. Monitor staff user experience with restricted permissions
3. Plan bulk reservation grouping enhancement for next sprint
