# MVP User & Access Control Updates

## Summary

Updated user roles, permissions, and access controls to streamline the app for MVP launch and ongoing user management.

---

## Changes

### 1. **Staff Permission Restrictions** ✓
- **Rooms Page** (`app/(dashboard)/rooms/page.tsx`)
  - Added role-based permission check: only `admin` and `manager` roles can see the "Add Room" button
  - Staff, front desk, and accountant roles can still view rooms but cannot add new ones

### 2. **Settings & Profile Access** ✓
- **Settings Page** (`app/(dashboard)/settings/page.tsx`)
  - **All users and roles** now have full access to `/settings` for profile and password management
  - Removed "System Preferences" card (admin-only manage users button) — this functionality is now accessed via the sidebar's "Users & Roles" link
  - Updated page description to reflect profile + hotel info management

- **Header Profile Menu** (`components/layout/header.tsx`)
  - Changed "Profile" menu item to link to `/settings` directly
  - Updated label to "Profile & Settings" for clarity
  - All users can now access their settings from the user dropdown menu

### 3. **Public Signup Disabled** ✓
- **Signup Page** (`app/auth/sign-up/page.tsx`)
  - Disabled public self-signup — now redirects to login page
  - **New users are added from the app** via admin/manager panel ("Users & Roles" page)
  - Keeps signup routes available in case they're needed in the future but hidden from public access

---

## User Roles & Access

| Role | Add Room | Access Settings | Manage Users |
|------|----------|-----------------|--------------|
| Admin | ✓ | ✓ | ✓ (via sidebar) |
| Manager | ✓ | ✓ | ✗ |
| Front Desk | ✗ | ✓ | ✗ |
| Accountant | ✗ | ✓ | ✗ |
| Staff | ✗ | ✓ | ✗ |

---

## How to Add New Users

1. Log in as **Admin** or **Manager**
2. Click **Users & Roles** in the sidebar
3. Click the "Add User" button
4. Enter user details and assign a role
5. New user receives invitation/credentials (implementation depends on your email setup)

---

## Testing Checklist

- [ ] Staff user cannot see "Add Room" button on Rooms page
- [ ] Admin/Manager can see "Add Room" button
- [ ] All users can access `/settings` from profile dropdown
- [ ] All users can view and change their password in settings
- [ ] Visiting `/auth/sign-up` redirects to `/auth/login`
- [ ] "Users & Roles" link still visible in sidebar for admin/manager
