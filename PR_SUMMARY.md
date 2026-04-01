# Pull Request Summary: Folio Locking System & User Management

## Overview
This PR implements two major features: (1) a folio locking system that prevents new charges on checked-out folios and enables guests to view folio history, and (2) a complete user management system allowing admins/managers to add, edit, and delete team members with automated welcome emails.

---

## Feature 1: Folio Locking & History System

### Changes to Guest Detail Page
- **Folio Selector Dropdown**: Guests can now switch between all historical folios, each displayed with check-in date and status (active/checked_out)
- **Check Out Folio Button**: Admin-only action to lock a folio and prevent further charges
- **Fixed Outstanding Balance Display**: Now derives from `folio_charges` table sum instead of stale `guests.balance` column, ensuring accuracy across all scenarios
- **Auto-Refresh on Tab Focus**: Added `visibilitychange` listener so data refreshes when returning to the page after actions on booking detail
- **Manual Refresh Button**: Added refresh icon button in header for explicit data reload
- **Fixed Total Paid & Total Bookings**: Corrected bookings fetch query and balance derivation to show accurate values

### Changes to Booking Detail Page
- **Folio Status Badge**: Visual indicator showing "Folio Checked Out" when applicable
- **Disabled Controls When Checked Out**: All action buttons (Add Charge, Extend Stay, Edit, Delete) are disabled with the folio is locked
- **Validation in Handlers**: Both `handleAddCharge` and extend-stay modal validate `folio_status` before allowing operations

### Changes to City Ledger Page
- **Date Range Filter**: Added "From" and "To" date inputs to filter transactions by date range
- **Search by Guest Name**: Real-time search filtering transactions by guest or description
- **Clear Filters Button**: One-click reset of all active filters
- **Transaction Counter**: Shows filtered transaction count dynamically
- **Fixed Balance Derivation**: City Ledger Debit now correctly pulls from folio pending charges instead of unreliable `guests.balance`

### Changes to Bookings & Reservations Pages
- **Name Search Support**: Fixed search keys to use flat `guestName` field instead of nested `guests.name` path, enabling guest name filtering

---

## Feature 2: User Management System

### New API Routes

#### `POST /api/admin/users` — Create User
- Creates Supabase auth user with auto-confirmed email (no signup flow required)
- Inserts profile row with role and organization
- Validates caller is admin or manager in the same org
- Sends welcome email via Resend (or shows credentials modal if email fails)
- Returns user data + email status

#### `PATCH /api/admin/users/[id]` — Update User
- Allows updating user's full name, role, and password
- Validates caller authorization before making changes
- Uses admin client to bypass RLS for reliable updates

#### `DELETE /api/admin/users/[id]` — Delete User
- Removes user from auth and profiles table
- Validates caller authorization and organization boundary
- Uses admin client for complete data removal

#### `GET /api/admin/users/list` — List Organization Users
- Returns all users in the caller's organization
- Uses admin client to bypass restrictive RLS policy on `profiles` table
- Ordered by creation date

### Users & Roles Page Updates
- **Add User Button**: Opens dialog to create new users (admin/manager only)
- **Add User Dialog**: Collects full name, email, password (with show/hide), and role
- **Edit User Cards**: Each user card now has Edit and Delete buttons
- **Edit User Dialog**: Update name, role (with live permission preview), and optional new password
- **Delete Confirmation**: Safety confirmation before removing users
- **Credentials Display Modal**: Shows created user's login details with copy button and email status
- **Email Status Indicator**: If welcome email fails (sandbox restriction), modal shows yellow warning and instructions to verify domain at Resend

### Welcome Email System
- **New Email Template** (`lib/email/welcome-user.ts`): Professional HTML email with:
  - Login URL (auto-detected from environment)
  - Email address and temporary password (highlighted)
  - Role title and permission summary
  - Security notice to change password after first login
- **Resend Integration**: Automated email sending via Resend API
- **Graceful Fallback**: If email fails, user still created and credentials shown in modal
- **Environment Variables**: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` required

### Authorization & Security
- All user management endpoints validate caller is admin or manager
- Organization boundary checks prevent cross-org user access
- Admin client used only for fetching, mutations still use service role safeguards
- Caller ID passed from client and validated server-side

### RLS Fixes
- **Profiles Table**: Added new RLS policy to allow users to view all profiles in their organization (not just their own)
- **Admin Users List Route**: Bypasses restrictive RLS to ensure users list always loads even if RLS policies are too strict

---

## Database & Infrastructure

### New Files
- `/lib/email/welcome-user.ts` — Welcome email template with Resend integration
- `/app/api/admin/users/route.ts` — POST create user endpoint
- `/app/api/admin/users/[id]/route.ts` — PATCH update & DELETE remove user endpoints
- `/app/api/admin/users/list/route.ts` — GET list org users endpoint
- `/scripts/012_add_folio_status.sql` — Migration to add folio_status column (manual execution required)
- `/scripts/013_fix_profiles_rls.sql` — Migration to fix profiles RLS policy (manual execution required)

### Dependencies Added
- `resend@^4.0.0` — Email sending service

### Environment Variables Required
- `RESEND_API_KEY` — Resend API key for email delivery
- `RESEND_FROM_EMAIL` — Sender email address (must be verified domain for non-sandbox)

---

## Bug Fixes

1. **Outstanding Balance Showing Wrong Value**: Fixed by deriving from `folio_charges` sum instead of stale DB column, preventing render-cycle lag using direct state reference
2. **Total Paid & Bookings Showing 0**: Fixed folio_charges query that was failing silently due to missing `folio_status` column in select, and stopped mutating Supabase's frozen array
3. **User List Not Loading on Users & Roles Page**: Created admin API route to bypass RLS policy that only allowed viewing own profile row
4. **Guest Name Search Not Working**: Fixed search keys to use flat `guestName` field properly mapped in data transform
5. **Ledger Page Build Error**: Removed duplicate component code that was causing syntax error

---

## Testing Checklist

- [ ] Add a new user and verify credentials modal appears
- [ ] Test email delivery to `frontbill.tech@gmail.com` (sandbox mode) or custom domain if configured
- [ ] Create a booking, add charges, then add another charge after settling to verify balance shows correct total
- [ ] Logout and login as different admin to verify users list loads correctly
- [ ] Test folio checkout on booking detail page and verify Add Charge/Extend Stay buttons disable
- [ ] Filter City Ledger transactions by date range and guest name
- [ ] Verify Total Paid and Total Bookings display correct values in guest detail
- [ ] Edit and delete users from Users & Roles page

---

## Notes

- **Schema Migrations**: Scripts 012 and 013 must be executed manually in Supabase SQL editor if the automated script runner fails
- **Resend Sandbox**: New emails in free tier only send to verified address; upgrade plan or verify custom domain to send to arbitrary recipients
- **RLS Enforcement**: The admin users list route was necessary because the new RLS policy fix script couldn't execute via automated runner; the API route provides a reliable workaround

---

## Related Issues
- Folio cannot be repeated after guest checkout
- City Ledger balance showing incorrect values
- Guest detail page showing stale data
- Users and Roles page not listing team members
- No user onboarding workflow for staff
